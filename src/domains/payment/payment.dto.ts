export type InitPaymentDto = {
  amount: number;
  description?: string;
};

export type InitPaymentResult = {
  paymentId: string;
  paymentUrl: string;
};

export type FreedomPayXmlResponse = Record<string, string>;