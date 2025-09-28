
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { DocumentData, DocumentType, Page } from './types';
import DocumentForm from './components/DocumentForm';
import DocumentPreview from './components/DocumentPreview';
import DocumentAnalyzer from './components/DocumentAnalyzer';
import { formalizeContentWithAI, suggestFormattingWithAI, proofreadWithAI, generateDocumentContentWithAI } from './services/geminiService';

type Tab = 'draft' | 'analyze';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>('draft');
  const [docData, setDocData] = useState<DocumentData>({
    documentType: DocumentType.TTr,
    issuingAuthority: 'PHÒNG NGHIÊN CỨU KHOA HỌC',
    issuingAuthorityFull: 'Phòng Nghiên cứu Khoa học',
    abstract: '',
    subject: 'V/v đề nghị phê duyệt kế hoạch tổ chức hội thảo khoa học năm 2025',
    pages: [{
        id: `page-${Date.now()}`,
        rawContent: 'Căn cứ kế hoạch công tác năm 2025, phòng Nghiên cứu Khoa học xây dựng kế hoạch tổ chức hội thảo "Ứng dụng AI trong quản trị doanh nghiệp". Kinh phí dự kiến 50 triệu đồng. Thời gian tổ chức: Tháng 12/2025. Kính trình Ban Giám đốc phê duyệt.',
        processedContent: '',
        formattedContent: ''
    }],
    recipients: 'Như trên;\n- Phòng Kế hoạch - Tài chính;\n- Lưu: VT, PNCKH.',
    signerTitle: 'TRƯỞNG PHÒNG',
    signerName: 'Nguyễn Văn A',
    place: 'Hà Nội',
    date: new Date(),
  });
  const [processingPageIndex, setProcessingPageIndex] = useState<number | null>(null);
  const [processingMessage, setProcessingMessage] = useState<string>('');
  const [proofreadingPageIndex, setProofreadingPageIndex] = useState<number | null>(null);
  const [isGeneratingDraft, setIsGeneratingDraft] = useState(false);
  const debounceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // State for preview settings
  const [fontFamily, setFontFamily] = useState<string>("'Times New Roman', Times, serif");
  const [fontSize, setFontSize] = useState<string>('13pt');

  // Load/Save preview settings from/to localStorage
  useEffect(() => {
    const savedFontFamily = localStorage.getItem('documentPreviewFontFamily');
    const savedFontSize = localStorage.getItem('documentPreviewFontSize');
    if (savedFontFamily) {
      setFontFamily(savedFontFamily);
    }
    if (savedFontSize) {
      setFontSize(savedFontSize);
    }
  }, []); // Runs only on mount

  useEffect(() => {
    localStorage.setItem('documentPreviewFontFamily', fontFamily);
    localStorage.setItem('documentPreviewFontSize', fontSize);
  }, [fontFamily, fontSize]);


  const handleDataChange = useCallback((field: keyof Omit<DocumentData, 'pages'>, value: string | Date) => {
    if (field === 'issuingAuthority') {
      const authority = value as string;
      const full = authority.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ');
      
      const abbr = authority
          .split(' ')
          .filter(word => word && word.charAt(0) === word.charAt(0).toUpperCase())
          .map(word => word.charAt(0))
          .join('');
          
      setDocData(prev => {
          const currentRecipients = prev.recipients;
          const lines = currentRecipients.split('\n');
          const lưuLineIndex = lines.findIndex(line => line.trim().startsWith('- Lưu:'));

          if (lưuLineIndex !== -1) {
              lines[lưuLineIndex] = `- Lưu: VT, ${abbr}.`;
          } else {
              lines.push(`- Lưu: VT, ${abbr}.`);
          }
          const newRecipients = lines.join('\n');

          return {
              ...prev, 
              issuingAuthority: authority, 
              issuingAuthorityFull: full,
              recipients: newRecipients
          };
      });
    } else {
        setDocData(prev => ({...prev, [field]: value}));
    }
  }, []);


  const handlePageContentChange = useCallback((index: number, rawContent: string) => {
    setDocData(prev => {
        const newPages = [...prev.pages];
        newPages[index] = {...newPages[index], rawContent, processedContent: '', formattedContent: '' };
        return {...prev, pages: newPages };
    });
  }, []);

   const handleAddPage = useCallback(() => {
    setDocData(prev => ({
      ...prev,
      pages: [
        ...prev.pages,
        { id: `page-${Date.now()}`, rawContent: '', processedContent: '', formattedContent: '' }
      ]
    }));
  }, []);

  const handleRemovePage = useCallback((index: number) => {
    setDocData(prev => ({
      ...prev,
      pages: prev.pages.filter((_, i) => i !== index)
    }));
  }, []);

  const handleProofreadPage = useCallback(async (index: number) => {
    const pageToProofread = docData.pages[index];
    if (!pageToProofread || !pageToProofread.rawContent.trim()) return;

    setProofreadingPageIndex(index);
    try {
        const correctedContent = await proofreadWithAI(pageToProofread.rawContent);
        // This re-uses the existing content change handler, which will trigger the debounce effect for formalization
        handlePageContentChange(index, correctedContent);
    } catch (error) {
        console.error("Lỗi khi kiểm tra chính tả:", error);
        alert("Đã xảy ra lỗi khi cố gắng kiểm tra văn bản. Vui lòng thử lại.");
    } finally {
        setProofreadingPageIndex(null);
    }
  }, [docData.pages, handlePageContentChange]);

  const handleGenerateDraft = useCallback(async (purpose: string, data: string, field: string, tone: string, detail: string) => {
    setIsGeneratingDraft(true);
    try {
        const result = await generateDocumentContentWithAI(purpose, data, docData.documentType, field, tone, detail);
        
        setDocData(prev => {
            const newPages: Page[] = [...prev.pages];
            if (newPages.length === 0) {
                newPages.push({ id: `page-${Date.now()}`, rawContent: '', processedContent: '', formattedContent: '' });
            }

            newPages[0] = {
                ...newPages[0],
                rawContent: result.rawContent || newPages[0].rawContent,
                processedContent: '', 
                formattedContent: ''
            };
            
            return {
                ...prev,
                subject: result.subject || prev.subject,
                recipients: result.recipients || prev.recipients,
                signerTitle: result.signerTitle || prev.signerTitle,
                pages: newPages,
            }
        });

    } catch (error: any) {
        console.error("Lỗi khi tạo nội dung tự động:", error);
        alert(error.message || "Đã xảy ra lỗi khi AI tạo nội dung. Vui lòng thử lại.");
    } finally {
        setIsGeneratingDraft(false);
    }
  }, [docData.documentType]);

  useEffect(() => {
    if (activeTab !== 'draft') return;

    if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
    }
    
    debounceTimeoutRef.current = setTimeout(async () => {
        const pageToProcessIndex = docData.pages.findIndex(p => p.rawContent.trim() && !p.processedContent);
        
        if (pageToProcessIndex === -1) return;

        const pageToProcess = docData.pages[pageToProcessIndex];

        setProcessingPageIndex(pageToProcessIndex);
        try {
            // Step 1: Formalize content
            setProcessingMessage("AI đang tinh chỉnh...");
            const processedResult = await formalizeContentWithAI(pageToProcess.rawContent);
            setDocData(prev => {
                const newPages = [...prev.pages];
                newPages[pageToProcessIndex] = { ...newPages[pageToProcessIndex], processedContent: processedResult, formattedContent: '' };
                return { ...prev, pages: newPages };
            });

            // Step 2: Suggest formatting
            setProcessingMessage("AI đang định dạng...");
            const formattedResult = await suggestFormattingWithAI(processedResult);
            setDocData(prev => {
                const newPages = [...prev.pages];
                newPages[pageToProcessIndex] = { ...newPages[pageToProcessIndex], formattedContent: formattedResult };
                return { ...prev, pages: newPages };
            });

        } catch (error) {
            console.error("Lỗi khi xử lý nội dung:", error);
            setDocData(prev => {
                 const newPages = [...prev.pages];
                newPages[pageToProcessIndex] = { ...newPages[pageToProcessIndex], processedContent: "Lỗi: Không thể xử lý nội dung. Vui lòng thử lại.", formattedContent: '' };
                return { ...prev, pages: newPages };
            });
        } finally {
            setProcessingPageIndex(null);
            setProcessingMessage('');
        }
    }, 1500);

    return () => {
        if (debounceTimeoutRef.current) {
            clearTimeout(debounceTimeoutRef.current);
        }
    };
  }, [docData.pages, activeTab]);


  const TabButton: React.FC<{tabId: Tab; label: string}> = ({tabId, label}) => (
    <button
      onClick={() => setActiveTab(tabId)}
      className={`px-4 py-2 text-sm sm:text-base font-semibold rounded-md transition-colors duration-300 ${activeTab === tabId ? 'bg-blue-600 text-white shadow' : 'text-gray-600 hover:bg-gray-200'}`}
      aria-pressed={activeTab === tabId}
    >
      {label}
    </button>
  );

  return (
    <div className="min-h-screen bg-gray-100 text-gray-800">
      <header className="bg-white shadow-md">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <h1 className="text-2xl sm:text-3xl font-bold text-blue-700">Trợ lý Văn bản Hành chính</h1>
          <p className="text-sm sm:text-base text-gray-600 mt-1">Soạn thảo & Phân tích văn bản với sự hỗ trợ của AI</p>
        </div>
      </header>
      <main className="container mx-auto p-4 sm:p-6 lg:p-8">
        <div className="mb-6 flex justify-center space-x-2 sm:space-x-4 bg-gray-200/60 p-1.5 rounded-lg max-w-md mx-auto">
          <TabButton tabId="draft" label="Soạn thảo Văn bản" />
          <TabButton tabId="analyze" label="Phân tích Văn bản" />
        </div>

        {activeTab === 'draft' && (
           <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <DocumentForm 
                data={docData} 
                onChange={handleDataChange} 
                onPageChange={handlePageContentChange}
                onAddPage={handleAddPage}
                onRemovePage={handleRemovePage}
                processingPageIndex={processingPageIndex}
                processingMessage={processingMessage}
                onProofread={handleProofreadPage}
                proofreadingPageIndex={proofreadingPageIndex}
                onGenerateDraft={handleGenerateDraft}
                isGeneratingDraft={isGeneratingDraft}
              />
              <div>
                {/* Preview Settings UI */}
                <div className="bg-white p-4 rounded-lg shadow-lg mb-6">
                  <h3 className="text-lg font-bold text-gray-800 mb-3">Tùy chỉnh Hiển thị</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="fontFamily" className="block text-sm font-medium text-gray-700 mb-1">Phông chữ</label>
                      <select id="fontFamily" value={fontFamily} onChange={(e) => setFontFamily(e.target.value)} className="w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 transition">
                        <option value="'Times New Roman', Times, serif">Times New Roman</option>
                        <option value="Arial, sans-serif">Arial</option>
                        <option value="'Roboto', sans-serif">Roboto</option>
                      </select>
                    </div>
                    <div>
                      <label htmlFor="fontSize" className="block text-sm font-medium text-gray-700 mb-1">Cỡ chữ</label>
                      <select id="fontSize" value={fontSize} onChange={(e) => setFontSize(e.target.value)} className="w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 transition">
                        <option value="12pt">12 pt</option>
                        <option value="13pt">13 pt (Chuẩn)</option>
                        <option value="14pt">14 pt</option>
                      </select>
                    </div>
                  </div>
                </div>
                <DocumentPreview data={docData} fontFamily={fontFamily} fontSize={fontSize} />
              </div>
            </div>
        )}

        {activeTab === 'analyze' && (
          <DocumentAnalyzer />
        )}

      </main>
      <footer className="text-center py-4 text-gray-500 text-sm">
        <p>Nguyễn Hưng - 0913238099</p>
      </footer>
    </div>
  );
};

export default App;
