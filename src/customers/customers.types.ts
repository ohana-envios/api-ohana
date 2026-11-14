export type CustomerSummary = {
  id: string;
  type: 'PERSON' | 'COMPANY';
  displayName: string;
  legalName: string | null;
  documentType: string | null;
  documentNumber: string | null;
  email: string | null;
  phone: string | null;
  enabled: boolean;
  addressCount: number;
};

export type CustomerAddress = {
  id: string;
  label: string | null;
  street: string;
  number: string;
  locality: string;
  department: string;
  reference: string | null;
  notes: string | null;
};

export type CustomerDetail = CustomerSummary & { addresses: CustomerAddress[] };

export type CustomerList = {
  items: CustomerSummary[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type CustomerListQuery = {
  search: string;
  status: 'all' | 'enabled' | 'disabled';
  page: number;
  pageSize: number;
};
