export const MASTER_TEST_ACCOUNT_EMAIL = "sanborn.li.hk@gmail.com";
export const DEPLOYMENT_CREDENTIAL_MONTHLY_QUOTA = 100;

export const isMasterTestAccount = (
  email: string | undefined | null,
): boolean => (email ?? "").trim().toLowerCase() === MASTER_TEST_ACCOUNT_EMAIL;
