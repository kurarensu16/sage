import { buildCsv, encodeCsvField } from '../src/lib/csvExport.js';

const cases = [
  ['plain', 'plain'],
  ['a,b', '"a,b"'],
  ['a"b', '"a""b"'],
  ['a\r\nb', '"a\r\nb"'],
  [null, ''],
  [undefined, ''],
];

for (const [input, expected] of cases) {
  const actual = encodeCsvField(input);
  if (actual !== expected) {
    throw new Error(`CSV encoding mismatch: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}.`);
  }
}

const csv = buildCsv([
  ['A', 'B'],
  ['x,y', 'quoted "value"'],
]);

const expectedCsv = 'A,B\r\n"x,y","quoted ""value"""';
if (csv !== expectedCsv) {
  throw new Error(`CSV document mismatch: ${JSON.stringify(csv)}.`);
}

let malformedRowRejected = false;
try {
  buildCsv([
    ['A', 'B'],
    ['only one'],
  ]);
} catch {
  malformedRowRejected = true;
}

if (!malformedRowRejected) {
  throw new Error('CSV builder accepted a row with the wrong number of columns.');
}

console.log('CSV export verification passed.');
