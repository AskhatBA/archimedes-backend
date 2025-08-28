export interface MISFindPatientResponse {
  status: string;
  message: string;
  beneficiary: {
    id: string;
    name: string;
    phone_number: string;
    gender: 0 | 1;
    iin: string;
    birth_date: string;
    address: string;
    address_details: string;
  };
  access_token: string;
  token_type: string;
}
