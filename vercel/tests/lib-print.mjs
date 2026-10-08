const c = (code) => (s) => `\x1b[${code}m${s}\x1b[0m`;
export const green = c(32);
export const red = c(31);
export const bold = c(1);
export const dim = c(2);
