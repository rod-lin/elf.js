"use strict";

;(function (fac) {
	if (typeof exports === "object" && exports) {
		fac(exports);
	} else {
		var mod = {};
		fac(mod);

		if (typeof define === "function" && define.amd) {
			define(mod);
		}
	}
}(function (mod) {
	
	mod.fromString = function (str) {
		var buf = new ArrayBuffer(str.length);
		var write = new Uint8Array(buf);

		for (var i = 0; i < str.length; i++) {
			write[i] = str.charCodeAt(i);
		}

		return buf;
	};

	mod.toString = function (buf, i, len) {
		i = i || 0;
		len = len || buf.length; // !! if len == 0, len = buf.length

		var j = i + len;
		var arr = new Uint8Array(buf);

		if (j > arr.length) throw "max length exceeded";

		var ret = "";

		for (; i < j; i++) {
			ret += String.fromCharCode(arr[i]);
		}

		return ret;
	};

	// Rules(similar to the struct module in Python)
	//     1. "x": padding byte, no value(null)
	//     2. "?": bool(1 byte)
	//     3. "b": sint8
	//     4. "B": uint8
	//     5. "h": sint16
	//     6. "H": uint16
	//     7. "i": sint32
	//     8. "I": uint32
	//     9. "f": float32
	//    10. "d": double64
	//    11. "s123": string of length 123. Can be other numbers. Doesn't read the ending '\0'.
	//     
	// Endian:
	//     ">" for big-endian
	//     "<" for small-endian
	// 
	// Notes:
	//     1. l and L may lost precision(if the bit length is greater than 54)
	//     2. q and Q is not supported
	//     3. other characters are ignored
	mod.unpack = function (rule, buf, ofs) {
		var view = new DataView(buf);
		var litend = true; // little endian

		ofs = ofs || 0;

		var ret = [];

		for (var i = 0; i < rule.length; i++) {
			switch (rule[i]) {
				case ">": litend = false; break;
				case "<": litend = true; break;

				case "x":
					ret.push(null);
					ofs++; break;

				case "?":
					ret.push(!!view.getInt8(ofs));
					ofs++; break;

				case "b":
					ret.push(view.getInt8(ofs));
					ofs++; break;

				case "B":
					ret.push(view.getUint8(ofs));
					ofs++; break;

				case "h":
					ret.push(view.getInt16(ofs, litend));
					ofs += 2; break;

				case "H":
					ret.push(view.getUint16(ofs, litend));
					ofs += 2; break;

				case "i":
					ret.push(view.getInt32(ofs, litend));
					ofs += 4; break;

				case "I":
					ret.push(view.getUint32(ofs, litend));
					ofs += 4; break;

				case "l":
				case "L":
					var h, l, sign;

					if (litend) {
						l = view.getUint32(ofs, litend);
						h = view.getUint32(ofs + 4, litend);
						sign = view.getInt8(ofs + 7) >= 0 ? 1 : -1;
					} else {
						l = view.getUint32(ofs + 4, litend);
						h = view.getUint32(ofs, litend);
						sign = view.getInt8(ofs) >= 0 ? 1 : -1;
					}

					if (rule[i] == "l") {
						h = h << 1 >> 1;
					}

					// console.log("high: " + h + ", low: " + l);

					var num = (rule[i] == "l" ? sign : 1) * (/* use multiply instead of shift */ h * Math.pow(2, 32) + l);

					ret.push(num);
					ofs += 8; break;

				case "f":
					ret.push(view.getFloat32(ofs, litend));
					ofs += 4; break;

				case "d":
					ret.push(view.getFloat64(ofs, litend));
					ofs += 8; break;

				case "s":
					for (var j = i + 1; j < rule.length && !isNaN(parseInt(rule[j])); j++);
					var len = rule.substring(i + 1, j);
					i = j - 1;
					
					if (!len.length) {
						ret.push(String.fromCharCode(view.getUint8(ofs)));
						ofs++;
					} else {
						len = parseInt(len);

						if (isNaN(len)) throw "lenght not a number";

						ret.push(mod.toString(buf, ofs, len));
						ofs += len;
					}

					break;

				// ignore other characters
			}
		}

		return ret;
	};

	var table_abiname = {
		"0": "System V",
		"1": "HP-UX",
		"2": "NetBSD",
		"3": "Linux",
		"4": "GNU Hurd",
		"6": "Solaris",
		"7": "AIX",
		"8": "IRIX",
		"9": "FreeBSD",
		"10": "Tru64",
		"11": "Novell Modesto",
		"12": "OpenBSD",
		"13": "OpenVMS",
		"14": "NonStop Kernel",
		"15": "AROS",
		"16": "Fenix OS",
		"17": "CloudABI",
		"83": "Sortix"
	};

	var table_archname = {
		"0": "No specific instruction set",
		"2": "SPARC",
		"3": "x86",
		"8": "MIPS",
		"20": "PowerPC",
		"40": "ARM",
		"42": "SuperH",
		"50": "IA-64",
		"62": "x86-64",
		"183": "AArch64",
		"243": "RISC-V"
	};

	mod.assert = function (cond, err) {
		if (!cond) {
			throw err;
		}
	};

	mod.parseELFHeader = function (buf) {
		var pre = mod.unpack(
			"<s4"			// magic number(0x127 "ELF")
			+ "B"			// class(1 for 32-bit or 2 for 64-bit)
			+ "B"			// endian(1 for little endian or 2 for big endian)
			+ "B"			// version 1(usually 1)
			+ "B"			// system ABI
			+ "II"			// 8-byte padding(the first byte could be API version)
		, buf);

		mod.assert(pre[0] == "\x7FELF", "illegal magic number");
		mod.assert(pre[1] == 1 || pre[1] == 2, "illegal class");
		mod.assert(pre[2] == 1 || pre[2] == 2, "illegal endian");

		var bit = pre[1] == 1 ? 32 : 64;
		var litend = pre[2] == 1 ? true : false;

		var head = mod.unpack(
			(litend ? "<" : ">")
			+ "HH"			// type, machine
			+ "I"			// version 2(usually 1)

			// entry of the program
			// program header table offset
			// section header table offset

			+ (bit == 32 ? "III" : "LLL")

			+ "I"			// flags(??)
			+ "H"			// ELF header size
			+ "H"			// size of each entry in program header table
			+ "H"			// number of entry in program header table
			+ "H"			// size of each entry in section header table
			+ "H"			// number of entry in section header table
			+ "H"			// index of section name of each section(??)
		, buf, 16);

		var ret = {
			class: bit,
			litend: litend,
			v1: pre[3],

			abi: pre[4],
			abi_name: table_abiname[pre[4]],

			type: head[0],
			
			arch: head[1],
			arch_name: table_archname[head[1]],

			v2: head[2],

			entry: head[3],
			phofs: head[4],
			shofs: head[5],

			flags: head[6],
			size: head[7],

			phentsize: head[8],
			phnum: head[9],

			shentsize: head[10],
			shnum: head[11],

			shstrndx: head[12]
		};

		return ret;
	};

}));
