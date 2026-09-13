// Проба к развилке bugs/233: привязан ли oobCode ссылки входа к адресу и что отдаёт проверка кода.
// Ходит в эмулятор Auth стенда теми же REST-вызовами, что делает SDK.
const AUTH = 'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1';
const PROJECT = 'demo-ndim-dev';
const KEY = 'demo-api-key';
const post = async (path, body) => {
  const r = await fetch(`${AUTH}/${path}?key=${KEY}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  return { status: r.status, body: await r.json() };
};
async function codeFor(email) {
  await post('accounts:sendOobCode', { requestType: 'EMAIL_SIGNIN', email, continueUrl: 'http://localhost:5173/profile' });
  const all = await fetch(`http://127.0.0.1:9099/emulator/v1/projects/${PROJECT}/oobCodes`).then((r) => r.json());
  return all.oobCodes.filter((c) => c.email === email && c.requestType === 'EMAIL_SIGNIN').at(-1).oobCode;
}
const stamp = Date.now();
const owner = `probe-owner-${stamp}@example.com`;
const other = `probe-other-${stamp}@example.com`;

// 1. Что отдаёт проверка кода (checkActionCode = accounts:resetPassword только с oobCode)
const c1 = await codeFor(owner);
const check = await post('accounts:resetPassword', { oobCode: c1 });
console.log('1 checkActionCode →', check.status, JSON.stringify(check.body));
// код после проверки жив?
const afterCheck = await post('accounts:signInWithEmailLink', { email: owner, oobCode: c1 });
console.log('1b вход тем же кодом после проверки →', afterCheck.status, afterCheck.body.email ?? afterCheck.body.error?.message);

// 2. Код выписан owner, в ссылку подставлен чужой адрес
const c2 = await codeFor(owner);
const forged = await post('accounts:signInWithEmailLink', { email: other, oobCode: c2 });
console.log('2 чужой адрес при коде owner →', forged.status, forged.body.email ?? forged.body.error?.message);

// 3. Тот же код, верный адрес — жив ли после неудачной подделки
const honest = await post('accounts:signInWithEmailLink', { email: owner, oobCode: c2 });
console.log('3 верный адрес тем же кодом →', honest.status, honest.body.email ?? honest.body.error?.message);

// 4. Повторное предъявление использованного кода
const again = await post('accounts:signInWithEmailLink', { email: owner, oobCode: c2 });
console.log('4 повтор использованного кода →', again.status, again.body.email ?? again.body.error?.message);
