import { strict as assert } from 'node:assert';

let input = '';
for await (const chunk of process.stdin) input += chunk;
const compose = JSON.parse(input.replace(/^\uFEFF/, ''));
assert.equal(compose.services?.api?.environment?.ZITADEL_MOBILE_CLIENT_IDS, 'ci-mobile-client', 'El contenedor API debe recibir el identificador móvil de ZITADEL');
