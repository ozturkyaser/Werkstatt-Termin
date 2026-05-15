/** Gleiche Logik wie backend/src/services/ai.js (platesMatch) für UI-Vorschau */

function levenshtein(a, b) {
  if (a === b) return 0;
  const m = a.length; const n = b.length;
  if (!m) return n; if (!n) return m;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 1; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
  return dp[m][n];
}

export function normalizePlate(plate) {
  if (!plate) return '';
  return String(plate).toUpperCase().replace(/\s+/g, ' ').trim();
}

export function platesMatch(a, b) {
  if (!a || !b) return false;
  const na = normalizePlate(a).replace(/[-\s]/g, '');
  const nb = normalizePlate(b).replace(/[-\s]/g, '');
  if (na === nb) return true;
  return levenshtein(na, nb) <= 1 && Math.abs(na.length - nb.length) <= 1;
}
