
import React, { useState } from 'react';
import { DocumentData, DocumentType } from '../types';

interface DocumentFormProps {
  data: DocumentData;
  onChange: (field: keyof Omit<DocumentData, 'pages'>, value: string | Date) => void;
  onPageChange: (index: number, value: string) => void;
  onAddPage: () => void;
  onRemovePage: (index: number) => void;
  processingPageIndex: number | null;
  processingMessage: string;
  onProofread: (index: number) => void;
  proofreadingPageIndex: number | null;
  onGenerateDraft: (purpose: string, data: string, field: string, tone: string, detail: string) => Promise<void>;
  isGeneratingDraft: boolean;
}

const InputField: React.FC<{label: string; id: string; value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; placeholder?: string}> = ({label, id, ...props}) => (
    <div>
        <label htmlFor={id} className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
        <input type="text" id={id} {...props} className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 transition"/>
    </div>
);

const TextAreaField: React.FC<{label?: string; id: string; value: string; onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void; placeholder?: string; rows?: number, loadingMessage?: string, disabled?: boolean}> = ({label, id, loadingMessage, disabled, ...props}) => (
    <div className="relative">
        {label && <label htmlFor={id} className="block text-sm font-medium text-gray-700 mb-1">{label}</label>}
        <textarea 
            id={id} 
            {...props} 
            disabled={disabled}
            spellCheck="true"
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 transition resize-y disabled:bg-gray-100"
        />
        {loadingMessage && (
             <div className="absolute bottom-2 right-2 flex items-center space-x-2 text-sm text-blue-600">
                <svg className="animate-spin h-4 w-4 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span>{loadingMessage}</span>
            </div>
        )}
    </div>
);

const AiCustomizationSettings: React.FC<{
    field: string; setField: (v: string) => void;
    tone: string; setTone: (v: string) => void;
    detail: string; setDetail: (v: string) => void;
    disabled?: boolean;
}> = ({ field, setField, tone, setTone, detail, setDetail, disabled }) => (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-3 bg-blue-100/50 border border-blue-200 rounded-md">
        <div>
            <label htmlFor="ai-field" className="block text-xs font-medium text-gray-600 mb-1">Chuyên ngành</label>
            <select id="ai-field" value={field} onChange={e => setField(e.target.value)} disabled={disabled} className="w-full text-xs px-2 py-1 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 transition">
                <option value="default">Hành chính</option>
                <option value="law">Pháp lý</option>
                <option value="medical">Y tế</option>
                <option value="military">Quân đội</option>
                <option value="culture">Văn hóa - GD</option>
                <option value="technical">Kỹ thuật</option>
            </select>
        </div>
        <div>
            <label htmlFor="ai-tone" className="block text-xs font-medium text-gray-600 mb-1">Giọng văn</label>
            <select id="ai-tone" value={tone} onChange={e => setTone(e.target.value)} disabled={disabled} className="w-full text-xs px-2 py-1 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 transition">
                <option value="formal">Trang trọng</option>
                <option value="assertive">Quả quyết</option>
                <option value="neutral">Trung lập</option>
                <option value="friendly">Thân thiện</option>
            </select>
        </div>
        <div>
            <label htmlFor="ai-detail" className="block text-xs font-medium text-gray-600 mb-1">Mức độ chi tiết</label>
            <select id="ai-detail" value={detail} onChange={e => setDetail(e.target.value)} disabled={disabled} className="w-full text-xs px-2 py-1 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 transition">
                <option value="standard">Chuẩn mực</option>
                <option value="concise">Ngắn gọn</option>
                <option value="detailed">Chi tiết</option>
            </select>
        </div>
    </div>
);


const QuickDraftSection: React.FC<{onGenerate: (purpose: string, data: string, field: string, tone: string, detail: string) => void, isLoading: boolean, docType: DocumentType}> = ({ onGenerate, isLoading, docType }) => {
    const [purpose, setPurpose] = useState('');
    const [additionalData, setAdditionalData] = useState('');
    const [isOpen, setIsOpen] = useState(false);
    
    // AI Customization state
    const [aiField, setAiField] = useState('default');
    const [aiTone, setAiTone] = useState('formal');
    const [aiDetail, setAiDetail] = useState('standard');

    const handleSubmit = () => {
        if (purpose.trim()) {
            onGenerate(purpose, additionalData, aiField, aiTone, aiDetail);
        }
    }

    return (
         <div className="border border-blue-200 bg-blue-50/50 rounded-lg">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-full flex justify-between items-center p-3 text-left"
                aria-expanded={isOpen}
            >
                <div className="flex items-center gap-3">
                     <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
                    <span className="font-bold text-blue-800">Soạn thảo nhanh với AI</span>
                </div>
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className={`h-5 w-5 text-gray-500 transform transition-transform ${isOpen ? 'rotate-180' : ''}`}
                    viewBox="0 0 20 20"
                    fill="currentColor"
                >
                    <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
            </button>
            {isOpen && (
                <div className="p-4 border-t border-blue-200 space-y-4">
                    <TextAreaField 
                        label={`Mục đích ${docType}`}
                        id="draft-purpose"
                        value={purpose}
                        onChange={(e) => setPurpose(e.target.value)}
                        placeholder="Ví dụ: Đề nghị phê duyệt kế hoạch tổ chức hội thảo khoa học..."
                        rows={3}
                        disabled={isLoading}
                    />
                     <TextAreaField 
                        label="Dữ liệu cung cấp (nếu có)"
                        id="draft-data"
                        value={additionalData}
                        onChange={(e) => setAdditionalData(e.target.value)}
                        placeholder="Ví dụ: Tên hội thảo: Ứng dụng AI. Kinh phí: 50 triệu. Thời gian: Tháng 12/2025"
                        rows={3}
                        disabled={isLoading}
                    />
                     <AiCustomizationSettings
                        field={aiField} setField={setAiField}
                        tone={aiTone} setTone={setAiTone}
                        detail={aiDetail} setDetail={setAiDetail}
                        disabled={isLoading}
                    />
                    <button
                        onClick={handleSubmit}
                        disabled={!purpose.trim() || isLoading}
                        className="w-full flex items-center justify-center bg-blue-600 text-white font-bold py-2 px-4 rounded-lg shadow-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-all disabled:bg-gray-400 disabled:cursor-not-allowed"
                    >
                         {isLoading ? (
                            <>
                                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                <span>Đang tạo...</span>
                            </>
                        ) : (
                            <span>Tạo nội dung tự động</span>
                        )}
                    </button>
                </div>
            )}
        </div>
    );
}


const DocumentForm: React.FC<DocumentFormProps> = ({ data, onChange, onPageChange, onAddPage, onRemovePage, processingPageIndex, processingMessage, onProofread, proofreadingPageIndex, onGenerateDraft, isGeneratingDraft }) => {
  return (
    <div className="bg-white p-6 rounded-lg shadow-lg space-y-6">
      <h2 className="text-xl font-bold text-gray-800 border-b pb-3">Thông tin văn bản</h2>
      
      <QuickDraftSection onGenerate={onGenerateDraft} isLoading={isGeneratingDraft} docType={data.documentType}/>

      <div>
        <label htmlFor="documentType" className="block text-sm font-medium text-gray-700 mb-1">Loại văn bản</label>
        <select 
            id="documentType" 
            value={data.documentType} 
            onChange={(e) => onChange('documentType', e.target.value)}
            className="w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 transition"
        >
            {Object.entries(DocumentType).map(([key, value]) => (
                <option key={key} value={value}>{value.charAt(0) + value.slice(1).toLowerCase()}</option>
            ))}
        </select>
      </div>

      <InputField
        label="Cơ quan ban hành (IN HOA)"
        id="issuingAuthority"
        value={data.issuingAuthority}
        onChange={(e) => onChange('issuingAuthority', e.target.value)}
        placeholder="VÍ DỤ: BỘ KHOA HỌC VÀ CÔNG NGHỆ"
      />

       <TextAreaField
        label="Trích yếu văn bản (dưới số hiệu)"
        id="abstract"
        value={data.abstract || ''}
        onChange={(e) => onChange('abstract', e.target.value)}
        placeholder="Nội dung trích yếu ngắn gọn hiển thị dưới dòng Số:..."
        rows={2}
      />

      <TextAreaField
        label="Trích yếu nội dung (dưới tiêu đề)"
        id="subject"
        value={data.subject}
        onChange={(e) => onChange('subject', e.target.value)}
        placeholder="V/v đề nghị phê duyệt..."
        rows={2}
      />
      
      <div className="space-y-4">
        {data.pages.map((page, index) => (
            <div key={page.id} className="p-4 border border-gray-200 rounded-lg bg-gray-50/50">
                <div className="flex justify-between items-center mb-2 gap-2">
                    <label htmlFor={`rawContent-${index}`} className="text-sm font-bold text-gray-600">Nội dung Trang {index + 1}</label>
                     <div className="flex items-center gap-2">
                        <button 
                            onClick={() => onProofread(index)} 
                            disabled={!page.rawContent.trim() || proofreadingPageIndex !== null || processingPageIndex !== null}
                            className="flex items-center gap-1.5 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-md px-2 py-1 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Sửa lỗi chính tả & ngữ pháp bằng AI"
                        >
                            {proofreadingPageIndex === index ? (
                                <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                            ) : (
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path d="M17.293 2.293a1 1 0 00-1.414 0l-9.5 9.5a1 1 0 000 1.414l2.5 2.5a1 1 0 001.414 0l9.5-9.5a1 1 0 000-1.414l-2.5-2.5z" /><path d="M5 11.586l-2.293 2.293a1 1 0 000 1.414l2.5 2.5a1 1 0 001.414 0L9.414 15H15v-1H9.414l-4.414-3.414z" /></svg>
                            )}
                            <span>{proofreadingPageIndex === index ? 'Đang sửa...' : 'Sửa lỗi AI'}</span>
                        </button>
                        {data.pages.length > 1 && (
                            <button onClick={() => onRemovePage(index)} className="text-red-500 hover:text-red-700 transition-colors" title="Xóa trang">
                               <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v6a1 1 0 11-2 0V8z" clipRule="evenodd" />
                                </svg>
                            </button>
                        )}
                    </div>
                </div>
                 <TextAreaField
                    id={`rawContent-${index}`}
                    value={page.rawContent}
                    onChange={(e) => onPageChange(index, e.target.value)}
                    placeholder={`Nhập nội dung thô cho trang ${index + 1}...`}
                    rows={6}
                    loadingMessage={processingPageIndex === index ? processingMessage : undefined}
                />
            </div>
        ))}
         <button
            onClick={onAddPage}
            className="w-full text-sm font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 border-2 border-dashed border-blue-200 rounded-lg py-2 transition-colors"
        >
            + Thêm trang mới
        </button>
      </div>


      <TextAreaField
        label="Nơi nhận"
        id="recipients"
        value={data.recipients}
        onChange={(e) => onChange('recipients', e.target.value)}
        placeholder="- Như trên;&#10;- Lưu: VT,..."
        rows={4}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <InputField
            label="Chức vụ người ký (IN HOA)"
            id="signerTitle"
            value={data.signerTitle}
            onChange={(e) => onChange('signerTitle', e.target.value)}
            placeholder="VÍ DỤ: GIÁM ĐỐC"
        />
        <InputField
            label="Họ và tên người ký"
            id="signerName"
            value={data.signerName}
            onChange={(e) => onChange('signerName', e.target.value)}
            placeholder="Ví dụ: Nguyễn Văn A"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <InputField
            label="Địa danh"
            id="place"
            value={data.place}
            onChange={(e) => onChange('place', e.target.value)}
            placeholder="Ví dụ: Hà Nội"
        />
        <div>
            <label htmlFor="date" className="block text-sm font-medium text-gray-700 mb-1">Ngày ban hành</label>
            <input 
                type="date" 
                id="date" 
                value={data.date.toISOString().split('T')[0]}
                onChange={(e) => onChange('date', new Date(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 transition"
            />
        </div>
      </div>

    </div>
  );
};

export default DocumentForm;
