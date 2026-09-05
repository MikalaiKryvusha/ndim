import test from 'node:test';
import assert from 'node:assert/strict';
import { isForeignReportOnlyCsp, splitConsoleNoise } from './console-noise.mjs';

// Дословный текст из двери боя 2026-09-05 (и из bugs/179, 2026-08-22).
const GOOGLE_REPORT_ONLY =
  "Framing 'https://www.google.com/' violates the following report-only Content Security Policy directive: \"frame-ancestors 'self'\". The violation has been logged, but no further action has been taken.";

test('чужой report-only отчёт CSP — прощаемый шум (bugs/179)', () => {
  assert.equal(isForeignReportOnlyCsp(GOOGLE_REPORT_ONLY), true);
});

test('🔴 МУТАЦИЯ: то же сообщение БЕЗ report-only — настоящее нарушение, дверь обязана краснеть', () => {
  const blocking = GOOGLE_REPORT_ONLY.replace('report-only ', '');
  assert.equal(isForeignReportOnlyCsp(blocking), false);
});

test('🔴 МУТАЦИЯ: report-only, но рамка НАША — не прощается (наша политика, наш дефект)', () => {
  const ours = GOOGLE_REPORT_ONLY.replace('https://www.google.com/', 'https://ndimspace.app/');
  assert.equal(isForeignReportOnlyCsp(ours), false);
  const stage = GOOGLE_REPORT_ONLY.replace('https://www.google.com/', 'https://ndim-stage.web.app/');
  assert.equal(isForeignReportOnlyCsp(stage), false);
});

test('сообщение без Framing или с кривым адресом не прощается — признак неполный', () => {
  assert.equal(isForeignReportOnlyCsp('violates the following report-only Content Security Policy directive'), false);
  assert.equal(isForeignReportOnlyCsp("Framing 'не-адрес' violates the following report-only Content Security Policy"), false);
});

test('обычные ошибки консоли остаются настоящими', () => {
  for (const t of ['TypeError: x is not a function', 'FirebaseError: unavailable', 'Uncaught ReferenceError: foo'])
    assert.equal(isForeignReportOnlyCsp(t), false, t);
});

test('splitConsoleNoise возвращает проглоченное ОТДЕЛЬНО — прибор обязан его напечатать', () => {
  const { real, swallowed } = splitConsoleNoise([GOOGLE_REPORT_ONLY, 'TypeError: boom']);
  assert.deepEqual(real, ['TypeError: boom']);
  assert.deepEqual(swallowed, [GOOGLE_REPORT_ONLY]);
});
