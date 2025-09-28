
import React, { useRef } from 'react';
import { DocumentData, DocumentType } from '../types';

// Declare the docx global variable provided by the CDN script
declare var docx: any;

interface DocumentPreviewProps {
  data: DocumentData;
  fontFamily: string;
  fontSize: string;
}

const createAbbreviation = (text: string, type: 'doc' | 'org'): string => {
    if (!text) return '...';
    if (type === 'doc') {
        const entry = Object.entries(DocumentType).find(([, val]) => val === text);
        return entry ? entry[0] : '...';
    }
    // For org
    return text.split(' ').filter(word => word && word.charAt(0) === word.charAt(0).toUpperCase()).map(word => word.charAt(0)).join('');
}

const renderMarkdown = (markdownText: string) => {
    const lines = markdownText.split('\n');
    const elements: React.ReactNode[] = [];
    let listItems: React.ReactNode[] = [];

    const flushList = () => {
        if (listItems.length > 0) {
            elements.push(
                <ul key={`ul-${elements.length}`} className="list-disc pl-10 mb-4 text-justify" style={{ textIndent: '0rem' }}>
                    {listItems}
                </ul>
            );
            listItems = [];
        }
    };
    
    const parseBold = (text: string, keyPrefix: string) => {
        const parts = text.split('**');
        return parts.map((part, partIndex) => 
            partIndex % 2 === 1 ? <strong key={`${keyPrefix}-${partIndex}`}>{part}</strong> : part
        );
    };

    lines.forEach((line, index) => {
        const trimmedLine = line.trim();
        if (trimmedLine.startsWith('- ')) {
            const content = trimmedLine.substring(2);
            listItems.push(
                <li key={index}>
                    {parseBold(content, `li-${index}`)}
                </li>
            );
        } else {
            flushList();
            if (line.trim() !== '') {
                 elements.push(
                     <p key={index} className="mb-4 text-justify" style={{textIndent: '2rem'}}>
                        {parseBold(line, `p-${index}`)}
                     </p>
                );
            }
        }
    });

    flushList(); 
    return elements;
};


const DocumentPreview: React.FC<DocumentPreviewProps> = ({ data, fontFamily, fontSize }) => {
    const previewRef = useRef<HTMLDivElement>(null);
    const date = data.date;

    const getFullContentForCopy = () => {
        let fullText = '';
        const header = `
${data.issuingAuthority.toUpperCase()}\tCỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM
\tĐộc lập - Tự do - Hạnh phúc
Số: .../${createAbbreviation(data.documentType, 'doc')}-${createAbbreviation(data.issuingAuthority, 'org')}\t${data.place}, ngày ${date.getDate()} tháng ${date.getMonth() + 1} năm ${date.getFullYear()}
${data.abstract ? `${data.abstract}\n` : ''}
${data.documentType.toUpperCase()}
${data.subject}

Kính gửi: Ban Giám đốc.
`;
        fullText += header.replace(/^\s+/gm, ''); // Trim leading whitespace from each line

        data.pages.forEach((page, index) => {
            if (index > 0) {
                 fullText += `\n\n- ${index + 1} -\n\n`;
            }
            // Use processedContent for plain text, as formattedContent has markdown
            fullText += (page.processedContent || '').split('\n').map(p => `    ${p}`).join('\n');
        });

        const footer = `
Nơi nhận:
${data.recipients}
\t${data.signerTitle.toUpperCase()}
\t(Ký, ghi rõ họ tên)


\t${data.signerName}
`;
        fullText += footer;
        return fullText;
    };


    const copyToClipboard = () => {
        const textToCopy = getFullContentForCopy();
        navigator.clipboard.writeText(textToCopy).then(() => {
            alert('Đã sao chép nội dung văn bản!');
        }).catch(err => {
            console.error('Không thể sao chép', err);
            alert('Lỗi: không thể sao chép.');
        });
    };
    
    const handleExportTxt = () => {
        const content = getFullContentForCopy();
        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `van-ban-${Date.now()}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const handleExportDocx = () => {
        if (typeof docx === 'undefined') {
            alert("Thư viện xuất file (.docx) chưa được tải. Vui lòng kiểm tra kết nối mạng và thử lại.");
            return;
        }

        const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, AlignmentType, BorderStyle, VerticalAlign, HeadingLevel } = docx;

        // FIX: Replaced docx.Paragraph[] with any[] to resolve "Cannot find namespace 'docx'" error.
        // The `docx` library is loaded via a script tag and declared as `any`, so its specific types are not available at compile time.
        const parseContentForDocx = (markdownText: string): any[] => {
            // FIX: Replaced docx.Paragraph[] with any[]
            const paragraphs: any[] = [];
            const lines = (markdownText || '').split('\n');

            lines.forEach(line => {
                const trimmedLine = line.trim();
                if (trimmedLine.startsWith('- ')) {
                    const content = trimmedLine.substring(2);
                    const children = content.split('**').map((part, index) => new TextRun({ text: part, bold: index % 2 === 1 }));
                    paragraphs.push(new Paragraph({ children, bullet: { level: 0 } }));
                } else if (trimmedLine !== '') {
                    const children = trimmedLine.split('**').map((part, index) => new TextRun({ text: part, bold: index % 2 === 1 }));
                    paragraphs.push(new Paragraph({ children, indentation: { firstLine: 720 } })); // 720 DXA = 0.5 inch indent
                }
            });
            return paragraphs;
        };
        
        const bodyParagraphs = data.pages.flatMap((page, pageIndex) => {
            const content = page.formattedContent || page.processedContent;
            // FIX: Replaced docx.Paragraph[] with any[]
            const pageParas: any[] = [];
             if (pageIndex > 0) {
                pageParas.push(new Paragraph({
                    children: [new TextRun({ text: `- ${pageIndex + 1} -`, bold: true })],
                    alignment: AlignmentType.CENTER
                }));
            }
            return [...pageParas, ...parseContentForDocx(content)];
        });
        
        const docChildren = [
             new Table({
                width: { size: 100, type: WidthType.PERCENTAGE },
                columnWidths: [45, 55],
                rows: [
                    new TableRow({
                        children: [
                            new TableCell({
                                children: [
                                    new Paragraph({ children: [new TextRun({ text: (data.issuingAuthority || '[CƠ QUAN BAN HÀNH]').toUpperCase(), bold: true })], alignment: AlignmentType.CENTER }),
                                    new Paragraph({ text: "_______", alignment: AlignmentType.CENTER })
                                ],
                                verticalAlign: VerticalAlign.TOP,
                                borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } },
                            }),
                            new TableCell({
                                children: [
                                    new Paragraph({ children: [new TextRun({ text: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM", bold: true })], alignment: AlignmentType.CENTER }),
                                    new Paragraph({ text: "Độc lập - Tự do - Hạnh phúc", alignment: AlignmentType.CENTER }),
                                    new Paragraph({ text: "___________", alignment: AlignmentType.CENTER })
                                ],
                                verticalAlign: VerticalAlign.TOP,
                                borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } },
                            }),
                        ],
                    }),
                ],
            }),
            new Paragraph({text: ""}),
             new Table({
                width: { size: 100, type: WidthType.PERCENTAGE },
                 columnWidths: [45, 55],
                rows: [
                    new TableRow({
                        children: [
                             new TableCell({
                                children: [new Paragraph({ text: `Số: ....../${createAbbreviation(data.documentType, 'doc')}-${createAbbreviation(data.issuingAuthority, 'org')}`})],
                                borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } },

                            }),
                             new TableCell({
                                children: [new Paragraph({ children: [new TextRun({ text: `${data.place || '[Địa danh]'}, ngày ${date.getDate()} tháng ${date.getMonth() + 1} năm ${date.getFullYear()}`, italics: true })], alignment: AlignmentType.RIGHT })],
                                borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } },
                            }),
                        ]
                    })
                ]
            }),
        ];

        if (data.abstract) {
            docChildren.push(new Paragraph({ children: [new TextRun({ text: data.abstract, italics: true })] }));
        }

        docChildren.push(
            new Paragraph({text: ""}),
            new Paragraph({ children: [new TextRun({ text: (data.documentType || '[LOẠI VĂN BẢN]').toUpperCase(), bold: true })], alignment: AlignmentType.CENTER, heading: HeadingLevel.HEADING_1 }),
            new Paragraph({ children: [new TextRun({ text: data.subject || '[Trích yếu nội dung văn bản]', bold: true })], alignment: AlignmentType.CENTER }),
            new Paragraph({text: ""}),
            new Paragraph({ children: [new TextRun({ text: "Kính gửi: Ban Giám đốc.", bold: true })]}),
            ...bodyParagraphs,
            new Paragraph({text: ""}),
            new Table({
                width: { size: 100, type: WidthType.PERCENTAGE },
                columnWidths: [55, 45],
                rows: [
                    new TableRow({
                        children: [
                            new TableCell({
                                children: [
                                    new Paragraph({ children: [new TextRun({ text: "Nơi nhận:", bold: true, italics: true })] }),
                                    ...(data.recipients || '- Như trên;\n- Lưu: VT,...').split('\n').map(line => new Paragraph({ text: line })),
                                ],
                                verticalAlign: VerticalAlign.TOP,
                                borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } },
                            }),
                            new TableCell({
                                children: [
                                    new Paragraph({ children: [new TextRun({ text: (data.signerTitle || '[CHỨC VỤ]').toUpperCase(), bold: true })], alignment: AlignmentType.CENTER }),
                                    new Paragraph({ children: [new TextRun({ text: "(Ký, ghi rõ họ tên)", italics: true })], alignment: AlignmentType.CENTER }),
                                    new Paragraph({text: ""}), new Paragraph({text: ""}), new Paragraph({text: ""}),
                                    new Paragraph({ children: [new TextRun({ text: data.signerName || '[Họ và tên]', bold: true })], alignment: AlignmentType.CENTER }),
                                ],
                                verticalAlign: VerticalAlign.TOP,
                                borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } },
                            }),
                        ],
                    }),
                ],
            }),
        );


        const doc = new Document({
            sections: [{
                children: docChildren
            }]
        });

        Packer.toBlob(doc).then(blob => {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `van-ban-${Date.now()}.docx`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }).catch(err => {
            console.error("Lỗi khi tạo file DOCX:", err);
            alert("Đã xảy ra lỗi khi tạo file .docx. Vui lòng kiểm tra console để biết thêm chi tiết.");
        });
    };


  return (
    <div className="sticky top-8">
        <div 
            className="bg-white p-8 rounded-lg shadow-lg document-preview leading-relaxed text-black" 
            style={{ fontFamily, fontSize }}
        >
            <div ref={previewRef}>
                {/* Header */}
                <div className="grid grid-cols-2 gap-4 mb-4">
                    <div className="text-center font-bold">
                        <p className="uppercase">{data.issuingAuthority || '[CƠ QUAN BAN HÀNH]'}</p>
                        <p className="border-b-2 border-black w-24 mx-auto mt-1"></p>
                    </div>
                    <div className="text-center font-bold">
                        <p>CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</p>
                        <p>Độc lập - Tự do - Hạnh phúc</p>
                        <p className="border-b-2 border-black w-40 mx-auto mt-1"></p>
                    </div>
                </div>

                {/* Info line */}
                <div className="grid grid-cols-2 gap-4 mb-2">
                    <div>
                        <p>Số: ....../{createAbbreviation(data.documentType, 'doc')}-{createAbbreviation(data.issuingAuthority, 'org')}</p>
                    </div>
                    <div className="text-right">
                        <p className="italic">{data.place || '[Địa danh]'}, ngày {date.getDate()} tháng {date.getMonth() + 1} năm {date.getFullYear()}</p>
                    </div>
                </div>
                
                {/* Abstract (Trích yếu dưới số) */}
                {data.abstract && (
                    <div className="mb-4">
                        <p className="italic text-sm">{data.abstract}</p>
                    </div>
                )}


                {/* Title */}
                <div className="text-center mb-6">
                    <p className="font-bold uppercase text-base mb-2">{data.documentType || '[LOẠI VĂN BẢN]'}</p>
                    <p className="font-bold">{data.subject || '[Trích yếu nội dung văn bản]'}</p>
                </div>
                
                {/* Body */}
                <div className="mb-6">
                    <p className="mb-4 text-left font-bold">Kính gửi: Ban Giám đốc.</p>
                    {data.pages.map((page, pageIndex) => (
                        <React.Fragment key={page.id}>
                            {pageIndex > 0 && (
                                <div className="text-center font-bold py-4">- {pageIndex + 1} -</div>
                            )}
                            {(page.formattedContent || page.processedContent) 
                                ? renderMarkdown(page.formattedContent || page.processedContent) 
                                : <p className="mb-4 text-justify" style={{textIndent: '2rem'}}>...</p> 
                            }
                        </React.Fragment>
                    ))}
                </div>

                {/* Footer */}
                <div className="grid grid-cols-2 gap-4">
                    <div className="text-left">
                        <p className="font-bold italic">Nơi nhận:</p>
                        <div className="whitespace-pre-line text-sm">
                            {data.recipients || '- Như trên;\n- Lưu: VT,...'}
                        </div>
                    </div>
                    <div className="text-center">
                        <p className="font-bold uppercase">{data.signerTitle || '[CHỨC VỤ]'}</p>
                        <p className="italic">(Ký, ghi rõ họ tên)</p>
                        <div className="h-20"></div>
                        <p className="font-bold">{data.signerName || '[Họ và tên]'}</p>
                    </div>
                </div>
            </div>
        </div>
        <div className="text-center mt-6 flex justify-center items-center gap-3 flex-wrap">
            <button
                onClick={copyToClipboard}
                className="bg-blue-600 text-white font-bold py-2 px-6 rounded-lg shadow-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-transform transform hover:scale-105"
            >
                Sao chép Nội dung
            </button>
            <button
                onClick={handleExportDocx}
                className="bg-green-600 text-white font-bold py-2 px-6 rounded-lg shadow-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition-transform transform hover:scale-105"
            >
                Xuất ra .docx
            </button>
            <button
                onClick={handleExportTxt}
                className="bg-gray-500 text-white font-bold py-2 px-6 rounded-lg shadow-md hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-400 transition-transform transform hover:scale-105"
            >
                Xuất ra .txt
            </button>
        </div>
    </div>
  );
};

export default DocumentPreview;
