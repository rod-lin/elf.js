"use strict";

var elf = require("./elf");
var fs = require("fs");

var buf = fs.readFileSync("test.elf", "ascii");
buf = elf.fromString(buf);

// console.log(buf);

// var ret = elf.unpack(
// 	"<"				// small endian
// 	+ "bs3s12"		// 16-byte header
// 	+ "HH"			// type, machine
// 	+ "I"			// version
// 	+ "I"			// entry
// 	+ "I"			// program header table offset
// 	+ "I"			// section header table offset
// 	+ "I"			// flags(??)
// 	+ "H"			// ELF header size
// 	+ "H"			// size of each entry in program header table
// 	+ "H"			// number of entry in program header table
// 	+ "H"			// size of each entry in section header table
// 	+ "H"			// number of entry in section header table
// 	+ "H"			// index of section name of each section(??)
// , buf);

// console.log(ret);

console.log(elf.parseELFHeader(buf));

// console.log(elf.unpack("<l", new Uint8Array([ 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x1f, 0x80 ]).buffer));
