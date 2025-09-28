

import React, { useState, useRef, ChangeEvent, DragEvent, useCallback, useEffect } from 'react';
import { extractTextFromImage, analyzeText } from '../services/geminiService';

interface ProcessedFile {
  id: string;
  file: File;
  thumbnail: string;
  content: string;
  status: 'pending' | 'processing' | 'done' | 'error';
  error?: string;
}

const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = error => reject(error);
  });
};

const readTextFile = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsText(file, 'UTF-8');
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = error => reject(error);
    });
};

/**
 * Waits for a global library to be available on the window object.
 * This is useful for scripts loaded from a CDN.
 * @param name The name of the library on the window object (e.g., 'pdfjsLib').
 * @param timeout How long to wait in milliseconds before rejecting.
 */
// Fix: Add a trailing comma to the generic type parameter <T,> to prevent TSX from misinterpreting it as a JSX tag. This resolves numerous cascading parsing errors.
const waitForGlobal = <T,>(name: string, timeout = 10000): Promise<T> => {
    return new Promise((resolve, reject) => {
        const startTime = Date.now();
        const check = () => {
            const lib = (window as any)[name];
            if (lib) {
                resolve(lib);
            } else if (Date.now() - startTime > timeout) {
                reject(new Error(`Thư viện ${name} không tải được sau ${timeout / 1000} giây. Vui lòng kiểm tra kết nối mạng, tắt các trình chặn quảng cáo và thử lại.`));
            } else {
                setTimeout(check, 100);
            }
        };
        check();
    });
};


// Helper to read PDF
const readPdfFile = async (file: File): Promise<string[]> => {
    try {
        const pdfjsLib = await waitForGlobal<any>('pdfjsLib');
        // Use a more reliable CDN (jsdelivr) for the worker, to match the main library script in index.html
        pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.worker.min.js`;
        
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        
        if (pdf.isEncrypted) {
            throw new Error("File PDF này được bảo vệ bằng mật khẩu và không thể đọc được nội dung.");
        }

        const pagesText: string[] = [];
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map((item: any) => item.str).join(' ');
            pagesText.push(pageText);
        }

        if (pagesText.every(p => !p.trim())) {
            throw new Error("Không tìm thấy văn bản trong file PDF. File có thể chỉ chứa hình ảnh (cần OCR), bị mã hóa, hoặc bị lỗi.");
        }
        return pagesText;
    } catch (error: any) {
        console.error("PDF Read Error:", error);

        // Pass through pre-formatted, user-friendly errors (from waitForGlobal or custom throws inside the try block).
        if (error.message.includes("Thư viện") || error.message.includes("bảo vệ bằng mật khẩu") || error.message.includes("Không tìm thấy văn bản")) {
            throw error;
        }

        // Handle specific pdfjsLib errors by checking the error object.
        const errorMessage = (error.message || '').toLowerCase();
        const errorName = error.name || '';

        if (errorName === 'PasswordException' || errorMessage.includes('password')) {
            throw new Error("File PDF này được bảo vệ bằng mật khẩu. Vui lòng gỡ bỏ mật khẩu và thử lại.");
        }

        if (errorName === 'InvalidPDFException' || errorMessage.includes('invalid pdf')) {
            throw new Error("File PDF không hợp lệ hoặc đã bị hỏng. Vui lòng kiểm tra lại file.");
        }
        
        if (errorMessage.includes('network') || errorMessage.includes('failed to fetch')) {
             throw new Error("Lỗi mạng khi tải các thành phần để đọc PDF. Vui lòng kiểm tra kết nối internet và thử lại.");
        }

        // Generic fallback for other unexpected errors.
        throw new Error("Đã xảy ra lỗi không xác định khi đọc file PDF. File có thể không tương thích.");
    }
};

// Helper to read DOCX
const readDocxFile = async (file: File): Promise<string> => {
     try {
        const mammoth = await waitForGlobal<any>('mammoth');
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer: arrayBuffer });
        return result.value;
    } catch(error: any) {
        console.error("DOCX Read Error:", error);
        throw new Error("Thư viện Mammoth.js (đọc .docx) chưa được tải hoặc file bị lỗi. Vui lòng kiểm tra kết nối mạng và thử lại.");
    }
};

// Helper to read Excel
const readExcelFile = async (file: File): Promise<string> => {
    try {
        const XLSX = await waitForGlobal<any>('XLSX');
        const arrayBuffer = await file.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: 'array' });
        let fullText = '';
        workbook.SheetNames.forEach(sheetName => {
            const worksheet = workbook.Sheets[sheetName];
            const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
            jsonData.forEach((row: any) => {
                fullText += (row as any[]).join('\t') + '\n';
            });
            fullText += '\n'; // Separator between sheets
        });
        return fullText;
    } catch(error: any) {
        console.error("Excel Read Error:", error);
        throw new Error("Thư viện SheetJS (đọc .xlsx) chưa được tải hoặc file bị lỗi. Vui lòng kiểm tra kết nối mạng và thử lại.");
    }
};

const getFileIcon = (file: File): string => {
    const fileName = file.name.toLowerCase();
    if (file.type.startsWith('image/')) {
        return URL.createObjectURL(file);
    }
    // Return SVG icons as data URIs for documents
    if (fileName.endsWith('.pdf')) {
        return `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 384 512'%3E%3Cpath fill='%23e53e3e' d='M320 464c8.8 0 16-7.2 16-16V160H256c-17.7 0-32-14.3-32-32V48H64c-8.8 0-16 7.2-16 16v384c0 8.8 7.2 16 16 16h256zM64 0C28.7 0 0 28.7 0 64v384c0 35.3 28.7 64 64 64h256c35.3 0 64-28.7 64-64V153.3c0-17-6.7-33.3-18.7-45.3L274.7 18.7C262.7 6.7 246.5 0 229.3 0H64zM256 0v128h128L256 0z'/%3E%3C/svg%3E`;
    }
    if (fileName.endsWith('.docx') || fileName.endsWith('.doc')) {
        return `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 384 512'%3E%3Cpath fill='%234299e1' d='M320 464c8.8 0 16-7.2 16-16V160H256c-17.7 0-32-14.3-32-32V48H64c-8.8 0-16 7.2-16 16v384c0 8.8 7.2 16 16 16h256zm-96-224H128v-32h96v32zm0 64H128v-32h96v32zm0 64H128v-32h96v32zM64 0C28.7 0 0 28.7 0 64v384c0 35.3 28.7 64 64 64h256c35.3 0 64-28.7 64-64V153.3c0-17-6.7-33.3-18.7-45.3L274.7 18.7C262.7 6.7 246.5 0 229.3 0H64zM256 0v128h128L256 0z'/%3E%3C/svg%3E`;
    }
    if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
        return `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 384 512'%3E%3Cpath fill='%2348bb78' d='M320 464c8.8 0 16-7.2 16-16V160H256c-17.7 0-32-14.3-32-32V48H64c-8.8 0-16 7.2-16 16v384c0 8.8 7.2 16 16 16h256zM184 224v32h-48v-32h48zm72 32h-48v-32h48v32zm-72 64v32h-48v-32h48zm72 32h-48v-32h48v32zM64 0C28.7 0 0 28.7 0 64v384c0 35.3 28.7 64 64 64h256c35.3 0 64-28.7 64-64V153.3c0-17-6.7-33.3-18.7-45.3L274.7 18.7C262.7 6.7 246.5 0 229.3 0H64zM256 0v128h128L256 0z'/%3E%3C/svg%3E`;
    }
    // Default text file icon
    return `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 384 512'%3E%3Cpath fill='%23a0aec0' d='M320 464c8.8 0 16-7.2 16-16V160H256c-17.7 0-32-14.3-32-32V48H64c-8.8 0-16 7.2-16 16v384c0 8.8 7.2 16 16 16h256zM64 0C28.7 0 0 28.7 0 64v384c0 35.3 28.7 64 64 64h256c35.3 0 64-28.7 64-64V153.3c0-17-6.7-33.3-18.7-45.3L274.7 18.7C262.7 6.7 246.5 0 229.3 0H64zM256 0v128h128L256 0z'/%3E%3C/svg%3E`;
};

const LoadingSpinner: React.FC<{text?: string; size?: 'sm' | 'md'}> = ({ text, size = 'md' }) => (
    <div className={`flex flex-col items-center justify-center text-center text-blue-600 space-y-2 ${size === 'sm' ? 'text-xs' : ''}`}>
        <svg className={`animate-spin text-blue-600 ${size === 'sm' ? 'h-5 w-5' : 'h-8 w-8'}`} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        {text && <span className="font-medium">{text}</span>}
    </div>
);

const CollapsibleSection: React.FC<{title: string; iconSrc?: string; isOpen: boolean; onToggle: () => void; children: React.ReactNode}> = ({ title, iconSrc, isOpen, onToggle, children }) => {
    return (
        <div className="border border-gray-200 rounded-md bg-white">
            <button
                onClick={onToggle}
                className="w-full flex justify-between items-center p-3 bg-gray-100 hover:bg-gray-200 transition-colors"
                aria-expanded={isOpen}
            >
                <div className="flex items-center min-w-0">
                    {iconSrc && <img src={iconSrc} alt={title} className="w-5 h-5 mr-2 object-contain flex-shrink-0" />}
                    <span className="font-medium text-gray-700 text-left truncate">{title}</span>
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
            <div className={`transition-all duration-300 ease-in-out overflow-hidden ${isOpen ? 'max-h-[40rem]' : 'max-h-0'}`}>
                <div className="p-3 border-t border-gray-200 overflow-y-auto max-h-[38rem]">
                    {children}
                </div>
            </div>
        </div>
    );
};

const AiCustomizationSettings: React.FC<{
    field: string; setField: (v: string) => void;
    tone: string; setTone: (v: string) => void;
    detail: string; setDetail: (v: string) => void;
    disabled?: boolean;
}> = ({ field, setField, tone, setTone, detail, setDetail, disabled }) => (
     <div className="space-y-3">
        <p className="text-sm font-medium text-gray-600">Tùy chỉnh văn phong AI:</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-3 bg-gray-100 border border-gray-200 rounded-md">
            <div>
                <label htmlFor="ai-field-analyzer" className="block text-xs font-medium text-gray-600 mb-1">Chuyên ngành</label>
                <select id="ai-field-analyzer" value={field} onChange={e => setField(e.target.value)} disabled={disabled} className="w-full text-xs px-2 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 transition">
                    <option value="default">Hành chính</option>
                    <option value="law">Pháp lý</option>
                    <option value="medical">Y tế</option>
                    <option value="military">Quân đội</option>
                    <option value="culture">Văn hóa - GD</option>
                    <option value="technical">Kỹ thuật</option>
                </select>
            </div>
            <div>
                <label htmlFor="ai-tone-analyzer" className="block text-xs font-medium text-gray-600 mb-1">Giọng văn</label>
                <select id="ai-tone-analyzer" value={tone} onChange={e => setTone(e.target.value)} disabled={disabled} className="w-full text-xs px-2 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 transition">
                    <option value="formal">Trang trọng</option>
                    <option value="assertive">Quả quyết</option>
                    <option value="neutral">Trung lập</option>
                    <option value="friendly">Thân thiện</option>
                </select>
            </div>
            <div>
                <label htmlFor="ai-detail-analyzer" className="block text-xs font-medium text-gray-600 mb-1">Mức độ chi tiết</label>
                <select id="ai-detail-analyzer" value={detail} onChange={e => setDetail(e.target.value)} disabled={disabled} className="w-full text-xs px-2 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 transition">
                    <option value="standard">Chuẩn mực</option>
                    <option value="concise">Ngắn gọn</option>
                    <option value="detailed">Chi tiết</option>
                </select>
            </div>
        </div>
    </div>
);


const DocumentAnalyzer: React.FC = () => {
    const [processedFiles, setProcessedFiles] = useState<ProcessedFile[]>([]);
    const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
    const [analysisPrompt, setAnalysisPrompt] = useState<string>('');
    const [analysisResult, setAnalysisResult] = useState<string>('');
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [error, setError] = useState<string>('');
    const [isDragOver, setIsDragOver] = useState<boolean>(false);
    const [isCopied, setIsCopied] = useState(false);
    const [draggedItemIndex, setDraggedItemIndex] = useState<number | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    
    // Refs are crucial for the sort logic to work reliably during rapid drag events
    const dragItem = useRef<number | null>(null);
    const dragOverItem = useRef<number | null>(null);

    // AI Customization state
    const [aiField, setAiField] = useState('default');
    const [aiTone, setAiTone] = useState('formal');
    const [aiDetail, setAiDetail] = useState('standard');

    const handleNewFiles = (newFiles: File[]) => {
        setError('');
        setAnalysisResult('');
        const filesToAdd = newFiles.map(file => ({
            id: `${file.name}-${file.lastModified}-${Math.random()}`,
            file,
            thumbnail: getFileIcon(file),
            content: '',
            status: 'pending' as 'pending',
        }));
        setProcessedFiles(prev => [...prev, ...filesToAdd]);
    };

    const extractContentFromFile = useCallback(async (file: File): Promise<string> => {
        const fileType = file.type;
        const fileName = file.name.toLowerCase();

        if (fileName.endsWith('.pdf')) {
            const pages = await readPdfFile(file);
            if (pages.length > 1) {
                return pages.map((pageText, pageIndex) => {
                    return `--- Trang ${pageIndex + 1} ---\n${pageText.trim()}`;
                }).join('\n\n');
            }
            return (pages[0] || '').trim();
        }

        if (fileType.startsWith('image/')) {
            const base64 = await fileToBase64(file);
            return await extractTextFromImage(base64, fileType);
        }
        if (fileType === 'text/plain') {
            return await readTextFile(file);
        }
        if (fileName.endsWith('.docx')) {
            return await readDocxFile(file);
        }
        if (fileName.endsWith('.doc')) {
            throw new Error('Định dạng file .doc cũ không được hỗ trợ. Vui lòng lưu file dưới dạng .docx và thử lại.');
        }
        if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
            return await readExcelFile(file);
        }
        
        throw new Error(`Định dạng file '${fileName}' không được hỗ trợ. Vui lòng chọn file PNG, JPEG, TXT, PDF, DOCX, hoặc XLSX.`);
    }, []);
    
    useEffect(() => {
        const processQueue = async () => {
            const fileToProcess = processedFiles.find(f => f.status === 'pending');
            if (!fileToProcess) return;

            setProcessedFiles(prev => prev.map(f => f.id === fileToProcess.id ? { ...f, status: 'processing' } : f));

            try {
                const content = await extractContentFromFile(fileToProcess.file);
                setProcessedFiles(prev => prev.map(f => f.id === fileToProcess.id ? { ...f, status: 'done', content: content.trim() } : f));
            } catch (err: any) {
                setProcessedFiles(prev => prev.map(f => f.id === fileToProcess.id ? { ...f, status: 'error', error: err.message } : f));
            }
        };

        processQueue();
    }, [processedFiles, extractContentFromFile]);


    const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
        const selectedFiles = e.target.files;
        if (selectedFiles) {
            handleNewFiles(Array.from(selectedFiles));
        }
    };
    
    const handleAnalysis = useCallback(async (promptOverride?: string) => {
        const promptToUse = promptOverride || analysisPrompt;
        const validFiles = processedFiles.filter(pf => pf.status === 'done' && pf.content);

        if (validFiles.length === 0 || !promptToUse.trim()) return;
        
        setError('');
        setAnalysisResult('');
        setIsLoading(true);

        const fullText = validFiles.map((processedFile, index) => {
            const fileNumber = index + 1;
            const fileName = processedFile.file.name;
            const content = processedFile.content;
            return `--- BẮT ĐẦU NỘI DUNG FILE ${fileNumber}: ${fileName} ---\n\n${content}\n\n--- KẾT THÚC NỘI DUNG FILE ${fileNumber} ---`;
        }).join('\n\n========================================\n\n');

        try {
            const result = await analyzeText(fullText, promptToUse, aiField, aiTone, aiDetail);
            setAnalysisResult(result);
        } catch (err: any) {
            setError(err instanceof Error ? err.message : 'Đã xảy ra lỗi khi phân tích.');
        } finally {
            setIsLoading(false);
        }
    }, [analysisPrompt, processedFiles, aiField, aiTone, aiDetail]);
    
    const handleQuickPromptClick = useCallback((prompt: string) => {
        setAnalysisPrompt(prompt); // Update textarea for visibility
        handleAnalysis(prompt); // Immediately trigger analysis
    }, [handleAnalysis]);

    const handleDragEvents = useCallback((e: DragEvent<HTMLDivElement>, isOver: boolean) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(isOver);
    }, []);

    const handleDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
        handleDragEvents(e, false);
        const droppedFiles = e.dataTransfer.files;
        if (droppedFiles && droppedFiles.length > 0) {
            handleNewFiles(Array.from(droppedFiles));
        }
    }, [handleDragEvents]);

    const handleToggleSection = useCallback((fileId: string) => {
        setOpenSections(prev => ({ ...prev, [fileId]: !prev[fileId] }));
    }, []);
    
    const handleDragStart = (e: DragEvent<HTMLDivElement>, index: number) => {
        dragItem.current = index;
        setDraggedItemIndex(index);
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleDragEnter = (index: number) => {
        if (dragItem.current !== index) {
           dragOverItem.current = index;
        }
    };

    const handleDragEnd = () => {
        handleSort();
        setDraggedItemIndex(null);
    };
    
    const handleSort = () => {
        // Check if the drop target is valid and different from the source
        if (dragItem.current === null || dragOverItem.current === null || dragItem.current === dragOverItem.current) {
            dragItem.current = null;
            dragOverItem.current = null;
            return;
        }

        const newFiles = [...processedFiles];
        // Take the dragged item out
        const draggedItemContent = newFiles.splice(dragItem.current, 1)[0];
        // Insert it back at the new position
        newFiles.splice(dragOverItem.current, 0, draggedItemContent);

        // Reset refs
        dragItem.current = null;
        dragOverItem.current = null;
        
        setProcessedFiles(newFiles);
    };
    
    const removeFile = (id: string) => {
        setProcessedFiles(prev => prev.filter(f => f.id !== id));
    };

    const handleCopyResult = useCallback(() => {
        if (!analysisResult) return;
        navigator.clipboard.writeText(analysisResult).then(() => {
            setIsCopied(true);
            setTimeout(() => setIsCopied(false), 2000);
        });
    }, [analysisResult]);

     const quickPrompts = [
        { label: 'Tóm tắt nội dung', value: 'Tóm tắt ngắn gọn nội dung chính của toàn bộ văn bản.' },
        { label: 'Liệt kê công việc', value: 'Liệt kê tất cả các đầu việc, nhiệm vụ, hoặc hành động cần thực hiện được đề cập trong văn bản này dưới dạng gạch đầu dòng.' },
        { label: 'Xác định mục tiêu', value: 'Tóm tắt mục tiêu chính và kết quả mong đợi của văn bản này trong 1-2 câu.' },
        { label: 'Dự thảo phản hồi', value: 'Dựa vào nội dung văn bản, hãy soạn thảo một email/công văn phản hồi chuyên nghiệp, lịch sự để gửi cho người ban hành.' },
    ];

    const allFilesProcessed = processedFiles.every(f => f.status === 'done' || f.status === 'error');
    const successfulFilesCount = processedFiles.filter(f => f.status === 'done').length;
    
    return (
        <div className="max-w-4xl mx-auto bg-white p-6 sm:p-8 rounded-lg shadow-lg space-y-8">
            
            {/* 1. File Upload */}
            <div className="space-y-3">
                <h2 className="text-xl font-bold text-gray-800">1. Tải lên Văn bản</h2>
                <div 
                    className={`p-6 border-2 border-dashed rounded-lg text-center cursor-pointer transition-colors duration-300 ${isDragOver ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400 bg-gray-50'}`}
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={(e) => handleDragEvents(e, true)}
                    onDragLeave={(e) => handleDragEvents(e, false)}
                    onDragEnter={(e) => handleDragEvents(e, true)}
                    onDrop={handleDrop}
                >
                    <input 
                        type="file" 
                        ref={fileInputRef} 
                        className="hidden" 
                        onChange={handleFileChange}
                        accept=".png,.jpeg,.jpg,.txt,.pdf,.docx,.xls,.xlsx"
                        multiple
                    />
                    <div className="flex flex-col items-center justify-center space-y-2 text-gray-500">
                         <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                        <p className="font-semibold">Kéo thả các file vào đây hoặc <span className="text-blue-600">nhấn để chọn</span></p>
                        <p className="text-xs">Hỗ trợ: PNG, JPEG, TXT, PDF, DOCX, XLSX</p>
                    </div>
                </div>
                 {processedFiles.length > 0 && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 mt-4">
                        {processedFiles.map((item, index) => {
                            const isDragging = draggedItemIndex === index;
                            const classNames = `
                                relative group p-2 border rounded-lg flex flex-col items-center justify-center space-y-2 
                                transition-all duration-200 shadow-sm hover:shadow-md
                                ${draggedItemIndex !== null ? 'cursor-grabbing' : 'cursor-grab'}
                                ${isDragging ? 'opacity-40 scale-95' : 'opacity-100'}
                            `;

                            return (
                                <div 
                                    key={item.id}
                                    className={classNames.trim().replace(/\s+/g, ' ')}
                                    draggable
                                    onDragStart={(e) => handleDragStart(e, index)}
                                    onDragEnter={() => handleDragEnter(index)}
                                    onDragEnd={handleDragEnd}
                                    onDragOver={(e) => e.preventDefault()}
                                >
                                    <div className="absolute top-1 right-1 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button onClick={() => removeFile(item.id)} className="p-0.5 bg-red-500 text-white rounded-full hover:bg-red-600">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                                        </button>
                                    </div>
                                    <div className="w-16 h-20 flex items-center justify-center">
                                        {item.status === 'processing' ? <LoadingSpinner size="sm" /> :
                                        item.status === 'error' ? <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-red-500" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg> :
                                        <img src={item.thumbnail} alt={item.file.name} className="max-w-full max-h-full object-contain" />
                                        }
                                    </div>
                                    <p className="text-xs text-center break-all w-full truncate" title={item.file.name}>{item.file.name}</p>
                                </div>
                            );
                        })}
                    </div>
                 )}
            </div>

            {/* 2. Extracted Content */}
            {processedFiles.length > 0 && (
                 <div className="space-y-3">
                    <div className="flex justify-between items-center">
                         <h2 className="text-xl font-bold text-gray-800">2. Nội dung đã Trích xuất</h2>
                         {!allFilesProcessed && <LoadingSpinner size="sm" text="Đang xử lý..."/>}
                    </div>
                    <div className="w-full p-3 bg-gray-100/70 border border-gray-200 rounded-md">
                        {processedFiles.filter(f => f.status !== 'pending').length > 0 ? (
                            <div className="space-y-2 max-h-96 overflow-y-auto p-1">
                                {processedFiles.map((item) => (
                                    <CollapsibleSection
                                        key={item.id}
                                        title={item.file.name}
                                        iconSrc={item.thumbnail}
                                        isOpen={!!openSections[item.id]}
                                        onToggle={() => handleToggleSection(item.id)}
                                    >
                                        {item.status === 'processing' && <div className="p-4"><LoadingSpinner text="AI đang đọc..."/></div> }
                                        {item.status === 'error' && <p className="text-red-600 font-medium p-2">{item.error}</p> }
                                        {item.status === 'done' && <pre className="whitespace-pre-wrap font-sans text-sm bg-white p-2 rounded">{item.content || '(Không có nội dung để hiển thị)'}</pre>}
                                    </CollapsibleSection>
                                ))}
                            </div>
                        ) : (
                             <div className="text-center text-gray-500 p-4">Chưa có nội dung nào được trích xuất.</div>
                        )}
                    </div>
                </div>
            )}


            {/* 3. Analysis Prompt */}
            {successfulFilesCount > 0 && (
                <div className="space-y-4">
                    <div>
                        <h2 className="text-xl font-bold text-gray-800 mb-3">3. Yêu cầu Phân tích</h2>
                        <textarea 
                            id="analysisPrompt"
                            value={analysisPrompt}
                            onChange={(e) => setAnalysisPrompt(e.target.value)}
                            placeholder="Nhập yêu cầu của bạn tại đây. Ví dụ: 'Tóm tắt nội dung chính', 'Liệt kê các công việc cần làm', 'Viết một email phản hồi cho văn bản này'..."
                            rows={4}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 transition resize-y"
                            aria-label="Yêu cầu phân tích"
                        />
                    </div>
                    
                    <AiCustomizationSettings
                        field={aiField} setField={setAiField}
                        tone={aiTone} setTone={setAiTone}
                        detail={aiDetail}
                        setDetail={setAiDetail}
                        disabled={isLoading}
                    />

                    <div className="space-y-3">
                        <p className="text-sm font-medium text-gray-600">Hoặc chọn một yêu cầu nhanh:</p>
                        <div className="flex flex-wrap gap-2">
                            {quickPrompts.map(prompt => (
                                <button 
                                    key={prompt.label}
                                    onClick={() => handleQuickPromptClick(prompt.value)}
                                    disabled={isLoading}
                                    className="px-3 py-1.5 text-sm bg-gray-200 text-gray-700 rounded-full hover:bg-gray-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {prompt.label}
                                </button>
                            ))}
                        </div>
                    </div>
                    <button 
                        onClick={() => handleAnalysis()} 
                        disabled={!analysisPrompt.trim() || isLoading || !allFilesProcessed}
                        className="w-full sm:w-auto flex items-center justify-center bg-blue-600 text-white font-bold py-2 px-6 rounded-lg shadow-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-all disabled:bg-gray-400 disabled:cursor-not-allowed"
                        title={!allFilesProcessed ? "Vui lòng đợi tất cả các file được xử lý xong" : ""}
                    >
                        {isLoading && <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>}
                        {isLoading ? 'Đang phân tích...' : 'Bắt đầu Phân tích'}
                    </button>
                </div>
            )}
            
            {/* 4. Analysis Result */}
             {(isLoading || analysisResult || (error && successfulFilesCount > 0)) && (
                 <div className="space-y-3">
                    <div className="flex justify-between items-center">
                        <h2 className="text-xl font-bold text-gray-800">4. Kết quả từ AI</h2>
                        {analysisResult && (
                            <button
                                onClick={handleCopyResult}
                                className="flex items-center gap-2 text-sm font-medium text-gray-600 bg-gray-200 hover:bg-gray-300 rounded-md px-3 py-1 transition-colors"
                            >
                                {isCopied ? (
                                    <>
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-green-600" viewBox="0 0 20 20" fill="currentColor">
                                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                        </svg>
                                        <span>Đã chép!</span>
                                    </>
                                ) : (
                                    <>
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                        </svg>
                                        <span>Sao chép</span>
                                    </>
                                )}
                            </button>
                        )}
                    </div>
                     <div className="w-full p-4 min-h-[12rem] bg-blue-50/50 border border-blue-200 rounded-md">
                        {isLoading && !analysisResult ? (
                            <div className="h-full flex items-center justify-center"><LoadingSpinner text="AI đang tư duy..." /></div>
                        ) : error && !analysisResult ? (
                            <p className="text-red-600 text-center font-semibold">{error}</p>
                        ) : (
                            <div className="prose prose-sm max-w-none whitespace-pre-wrap">
                                {analysisResult}
                            </div>
                        )}
                    </div>
                </div>
            )}

        </div>
    );
};

export default DocumentAnalyzer;