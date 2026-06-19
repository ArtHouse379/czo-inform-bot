export type ProzorroTenderResponse = {
  data: ProzorroTender;
};

export type ProzorroPortalTenderSummary = {
  id: string;
  tenderID: string;
  dateModified?: string;
  title?: string;
  status?: string;
};

export type ProzorroTender = {
  id: string;
  tenderID?: string;
  title?: string;
  dateModified?: string;
  status?: string;
  procuringEntity?: {
    name?: string;
    identifier?: {
      id?: string;
      scheme?: string;
      legalName?: string;
    };
  };
  documents?: ProzorroDocument[];
  complaints?: ProzorroComplaint[];
  questions?: ProzorroQuestion[];
  qualifications?: ProzorroQualification[];
  contracts?: ProzorroContract[];
  awards?: ProzorroAward[];
  lots?: unknown[];
};

export type ProzorroDocument = {
  id: string;
  title?: string;
  dateModified?: string;
  datePublished?: string;
};

export type ProzorroComplaint = {
  id: string;
  title?: string;
  status?: string;
  dateSubmitted?: string;
  dateModified?: string;
};

export type ProzorroQuestion = {
  id: string;
  title?: string;
  description?: string;
  answer?: string;
  date?: string;
  dateAnswered?: string;
};

export type ProzorroQualification = {
  id: string;
  status?: string;
  date?: string;
};

export type ProzorroContract = {
  id: string;
  status?: string;
  dateSigned?: string;
  dateModified?: string;
};

export type ProzorroAward = {
  id: string;
  status?: string;
};

export type MonitoringResponse = {
  data?: ProzorroMonitoring[] | { data?: ProzorroMonitoring[] };
};

export type ProzorroMonitoring = {
  id: string;
  monitoring_id?: string;
  monitoringID?: string;
  status?: string;
  dateCreated?: string;
  datePublished?: string;
  dateModified?: string;
  conclusion?: unknown;
  conclusionDate?: string;
};
