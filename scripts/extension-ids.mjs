/**
 * Chrome extension identities.
 *
 * The production ID is the Chrome Web Store listing's. Development and LAB builds carry
 * this PUBLIC key as the manifest `key`, so an unpacked build always gets the same ID
 * and can pair with mdbase. Chrome never needs the matching private key for an unpacked
 * extension, and none is kept.
 */
export const storeExtensionId = "kcbplgbcleppckifepdciipecjhdmchh";

export const developmentExtensionId = "bpcblaeaghagohijhhghbbeniecjflhg";

export const developmentPublicKey =
  "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAltmhFAL07yYnCyDJmD+TWLjVNYcoI6CzVSgC7S7vcrxEtD4Pn4bhdp2C5weGlB24ZzJtM/9SGOe9s+EXjY0ps1BkYddsrFsOOD0Ec7T32GSOyQxIhNXnreJkA9Eas3FD5KE31P/Bh5n835OOA6Gg/yr6/1g+gCFUeUIPii6TYk09L2VDotwfBHuOoWkKepPruTW6LOT8bNtMUxPH4VvYrnR+Ieq1sn63dhkJP2roQgZ/2uC8eRDbqS/i3TbHPnz6xhupNl2T9m3icaRHejfZQW9RBFwxyX/j85BkrIDHYsxFL/Is+Lwc0cHiZaKMQ0McJtz1we6Vdm2ZSkeS1gJeRwIDAQAB";

/** Firefox needs a stable add-on ID for storage and updates. */
export const firefoxAddonId = "tasknotes-browser-extension@tasknotes.dev";
