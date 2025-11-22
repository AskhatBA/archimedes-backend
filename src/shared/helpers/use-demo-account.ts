import { config } from '@/config';

export const useDemoAccount = () => {
  const { demoAccount } = config;
  const isDemoAccount = (phone: string, iin: string) =>
    phone === demoAccount.phone && iin === demoAccount.iin;

  return {
    isDemoAccount,
    phone: demoAccount.phone as string,
    iin: demoAccount.iin as string,
    otp: demoAccount.otp as string,
    misIin: demoAccount.misIin as string,
    misPhone: demoAccount.misPhone as string,
  };
};
