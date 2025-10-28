import { FileType } from './insurance.types';

export interface RefundRequestDTO {
  date: string;
  amount: number;
  files: FileType[];
  personId: string;
  programId: string;
}
