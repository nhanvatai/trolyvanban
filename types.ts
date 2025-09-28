
export enum DocumentType {
    TTr = 'TỜ TRÌNH',
    CV = 'CÔNG VĂN',
    QD = 'QUYẾT ĐỊNH',
    BC = 'BÁO CÁO',
    TB = 'THÔNG BÁO'
}

export interface Page {
    id: string;
    rawContent: string;
    processedContent: string;
    formattedContent: string;
}

export interface DocumentData {
    documentType: DocumentType;
    issuingAuthority: string;
    issuingAuthorityFull: string;
    abstract: string;
    subject: string;
    pages: Page[];
    recipients: string;
    signerTitle: string;
    signerName: string;
    place: string;
    date: Date;
}

export interface GeneratedDraft {
    subject: string;
    rawContent: string;
    recipients: string;
    signerTitle: string;
}