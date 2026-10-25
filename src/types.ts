export interface RecordSnapshot {
  battery1?: string;
  battery1Date?: string;
  battery2?: string;
  battery2Date?: string;
  starter?: string;
  starterDate?: string;
  alternator?: string;
  alternatorDate?: string;
  fanBelt?: string;
  fanBeltDate?: string;
  note?: string;
  snapshotTimestamp: number;
}

export interface TrackerRecord {
  id: string;
  busNumber: string;
  battery?: string; // Legacy
  battery1?: string;
  battery1Date?: string;
  battery2?: string;
  battery2Date?: string;
  starter?: string;
  starterDate?: string;
  alternator?: string;
  alternatorDate?: string;
  fanBelt?: string;
  fanBeltDate?: string;
  note?: string;
  timestamp: number;
  lastUpdated?: number;
  history?: RecordSnapshot[];
}
