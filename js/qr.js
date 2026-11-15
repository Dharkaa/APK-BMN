/*
 * Pembuat QR Code offline, QR Model 2 versi 1-L.
 * Kapasitas: hingga 25 karakter alfanumerik QR. Label SATRIA menggunakan token
 * non-sensitif seperti SATRIA:BMN:001, sehingga kode register/nilai aset tidak
 * dibuka oleh QR Code.
 */
(function () {
  "use strict";

  const ALPHANUMERIC = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:";
  const SIZE = 21;
  const DATA_CODEWORDS = 19;
  const EC_CODEWORDS = 7;
  const G15 = 0x537;
  const G15_MASK = 0x5412;
  const EXP = new Uint8Array(512);
  const LOG = new Uint8Array(256);

  (function initializeGaloisField() {
    let value = 1;
    for (let index = 0; index < 255; index += 1) {
      EXP[index] = value;
      LOG[value] = index;
      value <<= 1;
      if (value & 0x100) value ^= 0x11d;
    }
    for (let index = 255; index < 512; index += 1) EXP[index] = EXP[index - 255];
  })();

  function multiply(a, b) {
    if (a === 0 || b === 0) return 0;
    return EXP[LOG[a] + LOG[b]];
  }

  function generatorPolynomial(degree) {
    let polynomial = [1];
    for (let power = 0; power < degree; power += 1) {
      const next = new Array(polynomial.length + 1).fill(0);
      for (let index = 0; index < polynomial.length; index += 1) {
        next[index] ^= polynomial[index];
        next[index + 1] ^= multiply(polynomial[index], EXP[power]);
      }
      polynomial = next;
    }
    return polynomial;
  }

  function errorCorrection(data) {
    const generator = generatorPolynomial(EC_CODEWORDS);
    const remainder = new Array(EC_CODEWORDS).fill(0);
    data.forEach((byte) => {
      const factor = byte ^ remainder.shift();
      remainder.push(0);
      for (let index = 0; index < EC_CODEWORDS; index += 1) {
        remainder[index] ^= multiply(generator[index + 1], factor);
      }
    });
    return remainder;
  }

  function makeDataCodewords(text) {
    const source = String(text || "").toUpperCase();
    if (!source || source.length > 25 || [...source].some((char) => !ALPHANUMERIC.includes(char))) {
      throw new Error("Token QR harus berisi maksimal 25 karakter alfanumerik QR.");
    }

    const bits = [];
    const append = (value, length) => {
      for (let index = length - 1; index >= 0; index -= 1) bits.push((value >>> index) & 1);
    };

    append(0b0010, 4); // mode alfanumerik
    append(source.length, 9); // jumlah karakter untuk QR versi 1
    for (let index = 0; index < source.length; index += 2) {
      const first = ALPHANUMERIC.indexOf(source[index]);
      if (index + 1 < source.length) append(first * 45 + ALPHANUMERIC.indexOf(source[index + 1]), 11);
      else append(first, 6);
    }

    const capacity = DATA_CODEWORDS * 8;
    append(0, Math.min(4, capacity - bits.length));
    while (bits.length % 8 !== 0) bits.push(0);

    const bytes = [];
    for (let index = 0; index < bits.length; index += 8) {
      let byte = 0;
      for (let offset = 0; offset < 8; offset += 1) byte = (byte << 1) | bits[index + offset];
      bytes.push(byte);
    }
    let padIndex = 0;
    const padding = [0xec, 0x11];
    while (bytes.length < DATA_CODEWORDS) {
      bytes.push(padding[padIndex % 2]);
      padIndex += 1;
    }
    return bytes;
  }

  function makeMatrix() {
    return Array.from({ length: SIZE }, () => new Array(SIZE).fill(null));
  }

  function placeFinder(matrix, offsetX, offsetY) {
    for (let y = -1; y <= 7; y += 1) {
      for (let x = -1; x <= 7; x += 1) {
        const row = offsetY + y;
        const column = offsetX + x;
        if (row < 0 || row >= SIZE || column < 0 || column >= SIZE) continue;
        const inside = x >= 0 && x <= 6 && y >= 0 && y <= 6;
        const dark = inside && (x === 0 || x === 6 || y === 0 || y === 6 || (x >= 2 && x <= 4 && y >= 2 && y <= 4));
        matrix[row][column] = dark;
      }
    }
  }

  function placeTiming(matrix) {
    for (let index = 8; index < SIZE - 8; index += 1) {
      if (matrix[6][index] === null) matrix[6][index] = index % 2 === 0;
      if (matrix[index][6] === null) matrix[index][6] = index % 2 === 0;
    }
  }

  function bchDigit(value) {
    let digit = 0;
    let work = value;
    while (work !== 0) {
      digit += 1;
      work >>>= 1;
    }
    return digit;
  }

  function formatBits(data) {
    let value = data << 10;
    while (bchDigit(value) - bchDigit(G15) >= 0) {
      value ^= G15 << (bchDigit(value) - bchDigit(G15));
    }
    return ((data << 10) | value) ^ G15_MASK;
  }

  function placeFormat(matrix, mask) {
    // Level L = 01 (nilai 1), diikuti mask pattern.
    const bits = formatBits((1 << 3) | mask);
    for (let index = 0; index < 15; index += 1) {
      const dark = ((bits >>> index) & 1) === 1;
      if (index < 6) matrix[index][8] = dark;
      else if (index < 8) matrix[index + 1][8] = dark;
      else matrix[SIZE - 15 + index][8] = dark;

      if (index < 8) matrix[8][SIZE - index - 1] = dark;
      else if (index < 9) matrix[8][15 - index] = dark;
      else matrix[8][15 - index - 1] = dark;
    }
    matrix[SIZE - 8][8] = true; // modul gelap tetap
  }

  function placeData(matrix, codewords, mask) {
    let row = SIZE - 1;
    let direction = -1;
    let byteIndex = 0;
    let bitIndex = 7;

    for (let column = SIZE - 1; column > 0; column -= 2) {
      if (column === 6) column -= 1;
      while (true) {
        for (let offset = 0; offset < 2; offset += 1) {
          const currentColumn = column - offset;
          if (matrix[row][currentColumn] !== null) continue;
          let dark = false;
          if (byteIndex < codewords.length) dark = ((codewords[byteIndex] >>> bitIndex) & 1) === 1;
          // Mask 0: (baris + kolom) genap.
          if (mask === 0 && (row + currentColumn) % 2 === 0) dark = !dark;
          matrix[row][currentColumn] = dark;
          bitIndex -= 1;
          if (bitIndex < 0) {
            byteIndex += 1;
            bitIndex = 7;
          }
        }
        row += direction;
        if (row < 0 || row >= SIZE) {
          row -= direction;
          direction = -direction;
          break;
        }
      }
    }
  }

  function build(text) {
    const data = makeDataCodewords(text);
    const codewords = data.concat(errorCorrection(data));
    const matrix = makeMatrix();
    placeFinder(matrix, 0, 0);
    placeFinder(matrix, SIZE - 7, 0);
    placeFinder(matrix, 0, SIZE - 7);
    placeTiming(matrix);
    placeFormat(matrix, 0);
    placeData(matrix, codewords, 0);
    return matrix;
  }

  function escapeXml(value) {
    return String(value).replace(/[<>&"]/g, (character) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[character]);
  }

  function toSvg(text, label) {
    const matrix = build(text);
    const darkModules = [];
    matrix.forEach((row, y) => {
      row.forEach((dark, x) => {
        if (dark) darkModules.push(`M${x} ${y}h1v1H${x}z`);
      });
    });
    const accessibleLabel = escapeXml(label || `QR Code ${text}`);
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-1 -1 23 23" role="img" aria-label="${accessibleLabel}" shape-rendering="crispEdges"><rect x="-1" y="-1" width="23" height="23" fill="#ffffff"/><path fill="#101010" d="${darkModules.join("")}"/></svg>`;
  }

  window.SATRIA_QR = { build, toSvg };
})();
