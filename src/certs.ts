import type { CertAppliance, CertKind, CertificateData, CertificateRecord, CheckResult, FgaReading } from './types';

export interface CertDraft {
  kind: CertKind;
  date: string;
  nextDue: string;
  customerName: string;
  customerAddress: string;
  postcode: string;
  tenantName: string;
  appliances: CertAppliance[];
  tightness: CheckResult;
  pipework: CheckResult;
  emergencyControl: CheckResult;
  coAlarm: 'yes' | 'no' | 'na';
  fgaLow: FgaReading;
  fgaHigh: FgaReading;
  gasRate: string;
  burnerPressure: string;
  faultReported: string;
  workDone: string;
  partsFitted: string;
  warningNotice: boolean;
  notes: string;
  engineerName: string;
}

export function certTitle(kind: CertKind): string {
  if (kind === 'landlord') return 'Landlord gas safety record';
  if (kind === 'service') return 'Boiler service and maintenance certificate';
  return 'Repair certificate';
}

export function certPrefix(kind: CertKind): string {
  if (kind === 'landlord') return 'GS';
  if (kind === 'service') return 'SV';
  return 'RP';
}

export function nextCertRef(kind: CertKind, records: CertificateRecord[]): string {
  const prefix = certPrefix(kind);
  let highest = 0;
  for (const record of records) {
    const match = record.data.ref.match(new RegExp(`^${prefix}-(\\d+)$`));
    if (match) highest = Math.max(highest, Number(match[1]));
  }
  return `${prefix}-${String(highest + 1).padStart(4, '0')}`;
}

export function emptyFga(): FgaReading {
  return { co: '', co2: '', ratio: '' };
}

export function emptyAppliance(): CertAppliance {
  return {
    location: '',
    applianceType: 'Boiler',
    make: '',
    model: '',
    serial: '',
    flue: 'RS',
    operating: 'pass',
    safetyDevice: 'pass',
    ventilation: 'pass',
    flueCondition: 'pass',
    combustion: '',
    safe: 'yes',
    defects: '',
  };
}

export function draftFromCertificate(data: CertificateData): CertDraft {
  return {
    kind: data.kind,
    date: data.date,
    nextDue: data.nextDue,
    customerName: data.customerName,
    customerAddress: data.customerAddress,
    postcode: data.postcode,
    tenantName: data.tenantName,
    appliances: data.appliances.map((item) => ({ ...item })),
    tightness: data.tightness,
    pipework: data.pipework,
    emergencyControl: data.emergencyControl,
    coAlarm: data.coAlarm,
    fgaLow: { ...data.fgaLow },
    fgaHigh: { ...data.fgaHigh },
    gasRate: data.gasRate,
    burnerPressure: data.burnerPressure,
    faultReported: data.faultReported,
    workDone: data.workDone,
    partsFitted: data.partsFitted,
    warningNotice: data.warningNotice,
    notes: data.notes,
    engineerName: data.engineerName,
  };
}

export function emptyCert(kind: CertKind, today: string): CertDraft {
  return {
    kind,
    date: today,
    nextDue: '',
    customerName: '',
    customerAddress: '',
    postcode: '',
    tenantName: '',
    appliances: kind === 'repair' ? [] : [emptyAppliance()],
    tightness: 'pass',
    pipework: 'pass',
    emergencyControl: 'pass',
    coAlarm: 'na',
    fgaLow: emptyFga(),
    fgaHigh: emptyFga(),
    gasRate: '',
    burnerPressure: '',
    faultReported: '',
    workDone: '',
    partsFitted: '',
    warningNotice: false,
    notes: '',
    engineerName: '',
  };
}
