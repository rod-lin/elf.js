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
		len = len === undefined ? buf.byteLength : len;

		var j = i + len;
		var arr = new Uint8Array(buf);

		assert(j <= arr.length, "max length exceeded(max " + arr.length + ", " + j + " asked)");

		var ret = "";

		for (; i < j; i++) {
			ret += String.fromCharCode(arr[i]);
		}

		return ret;
	};

	function findZero(buf, ofs) {
		var arr = new Uint8Array(buf);

		for (var i = ofs; i < arr.length; i++) {
			if (arr[i] === 0)
				return i;
		}

		return -1;
	}

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
	//    12. "s@": string ending with '\0'
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

					if (j == i + 1) { // no length followed
						if (rule[j] == "@") { // "s@" a string ended with '\0'
							j = findZero(buf, ofs);
							
							ret.push(mod.toString(buf, ofs, j - ofs));
							ofs = j + 1; // add one for the remaining 1
							i++;
						} else {
							ret.push(String.fromCharCode(view.getUint8(ofs)));
							ofs++;
						}
					} else {
						var len = rule.substring(i + 1, j);
						i = j - 1;

						len = parseInt(len);
						assert(!isNaN(len), "lenght not a number");

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

	function assert(cond, err) {
		if (!cond) {
			throw new Error(err);
		}
	}

	function match(obj, arr, keys) {
		assert(keys.length == arr.length, "not the same length");

		for (var i = 0; i < arr.length; i++) {
			obj[keys[i]] = arr[i];
		}

		return obj;
	}

	mod.parseELFHeader = function (buf, ofs) {
		ofs = ofs || 0;

		var pre = mod.unpack(
			"<s4"			// magic number(0x127 "ELF")
			+ "B"			// class(1 for 32-bit or 2 for 64-bit)
			+ "B"			// endian(1 for little endian or 2 for big endian)
			+ "B"			// version 1(usually 1)
			+ "B"			// system ABI
			+ "II"			// 8-byte padding(the first byte could be API version)
		, buf, ofs);

		assert(pre[0] == "\x7FELF", "illegal magic number");
		assert(pre[1] == 1 || pre[1] == 2, "illegal class");
		assert(pre[2] == 1 || pre[2] == 2, "illegal endian");

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
		, buf, ofs + 16);

		var ret = {
			class: bit,
			litend: litend,
			v1: pre[3],

			abi: pre[4],
			abi_name: table_abiname[pre[4]]
		};

		match(ret, head, [
			"type", "arch", "v2", "entry",
			"phofs", "shofs", "flags", "size",
			"phentsize", "phnum", "shentsize",
			"shnum", "shstrndx"
		]);

		ret.arch_name = table_archname[ret.arch];

		return ret;
	};

	// program header table entry
	mod.parsePHEntry = function (header, buf, ofs) {
		ofs = ofs || 0;

		var ent = mod.unpack(
			(header.litend ? "<" : ">")
			+ "I" // type
			+ (header.class == 64 ? "ILLLLLL" : "IIIIIII") // rest
		, buf, ofs);

		var ret = {};

		if (header.class == 64) {
			match(ret, ent, [ "type", "flags", "offset", "vaddr", "paddr", "file_size", "mem_size", "align" ]);
		} else {
			match(ret, ent, [ "type", "offset", "vaddr", "paddr", "file_size", "mem_size", "flags", "align" ]);
		}

		return ret;
	};

	// section header table entry
	mod.parseSHEntry = function (header, buf, ofs) {
		ofs = ofs || 0;

		var rule = (header.litend ? "<" : ">");

		if (header.class == 64) {
			rule += "IILLLLIILL";
		} else {
			rule += "IIIIIIIIII";
		}

		var ent = mod.unpack(rule, buf, ofs);

		var ret = {};

		match(ret, ent, [ "name", "type", "flags", "addr", "offset", "size", "link", "info", "addralign", "entsize" ]);

		if (header.shstrofs)
			ret.name = mod.lookupStrtab(buf, header.shstrofs, ret.name);

		return ret;
	};

	mod.lookupStrtab = function (buf, ofs, index) {
		return mod.unpack("s@", buf, ofs + index)[0];
	};

	mod.parseELF = function (buf, ofs) {
		ofs = ofs || 0;

		var header = mod.parseELFHeader(buf, ofs);

		ofs = header.shofs + header.shstrndx * header.shentsize; // the file offset of the string table
		var strtab = mod.parseSHEntry(header, buf, ofs);
		header.shstrofs = strtab.offset;

		// console.log(header.shentsize * header.shnum);
		// console.log(mod.unpack("s@s@s@s@s@s@s@s@s@s@s@s@s@s@s@s@s@s@s@s@s@s@s@s@s@s@s@s@s@s@", buf, strtab.offset));

		var pht = [];
		ofs = header.phofs;

		for (var i = 0; i < header.phnum; i++) {
			pht.push(mod.parsePHEntry(header, buf, ofs));
			ofs += header.phentsize;
		}

		var sht = [];
		ofs = header.shofs;

		// console.log(ofs + 10 * header.shentsize);
		// console.log(mod.unpack("<B", buf, ofs + 10 * header.shentsize));

		for (var i = 0; i < header.shnum; i++) {
			// if (i == header.shstrndx) continue;

			var ent = mod.parseSHEntry(header, buf, ofs);
			ent.id = i;

			sht.push(ent);
			// console.log(sht[i].name);

			ofs += header.shentsize;
		}

		return {
			header: header,
			pht: pht,
			sht: sht
		};
	};

}));
