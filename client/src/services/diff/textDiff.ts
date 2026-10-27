import { TextDiffLine } from '../../types/diff';

/**
 * Computes a line-by-line diff between two text strings using the Longest Common Subsequence (LCS) approach.
 * Handles line numbers for base and target, formatted for unified diff display.
 */
export function computeTextDiff(baseText: string = '', targetText: string = ''): TextDiffLine[] {
  if (baseText === targetText) {
    return baseText.split('\n').map((content, idx) => ({
      type: 'unchanged',
      lineNumberBase: idx + 1,
      lineNumberTarget: idx + 1,
      content,
    }));
  }

  const baseLines = baseText.split('\n');
  const targetLines = targetText.split('\n');

  const m = baseLines.length;
  const n = targetLines.length;

  // Cap line count to prevent excessive memory/CPU for massive non-code files
  const MAX_LINES = 2000;
  if (m > MAX_LINES || n > MAX_LINES) {
    return [
      {
        type: 'unchanged',
        content: `[File too large for line-by-line diff: Base has ${m} lines, Target has ${n} lines]`,
      },
    ];
  }

  // DP table for LCS
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (baseLines[i - 1] === targetLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to build diff lines
  const result: TextDiffLine[] = [];
  let i = m;
  let j = n;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && baseLines[i - 1] === targetLines[j - 1]) {
      result.unshift({
        type: 'unchanged',
        lineNumberBase: i,
        lineNumberTarget: j,
        content: baseLines[i - 1],
      });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.unshift({
        type: 'added',
        lineNumberTarget: j,
        content: targetLines[j - 1],
      });
      j--;
    } else if (i > 0 && (j === 0 || dp[i][j - 1] < dp[i - 1][j])) {
      result.unshift({
        type: 'removed',
        lineNumberBase: i,
        content: baseLines[i - 1],
      });
      i--;
    }
  }

  return result;
}

