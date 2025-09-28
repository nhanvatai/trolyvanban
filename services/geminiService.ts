import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import { DocumentType, GeneratedDraft } from '../types';

const getAIClient = () => {
    const apiKey = import.meta.env.VITE_API_KEY;
    if (!apiKey) {
        throw new Error("API key not configured.");
    }
    return new GoogleGenAI({ apiKey });
}

const MAX_RETRIES = 8;
const INITIAL_BACKOFF_MS = 2000; // Start with a 2-second backoff

/**
 * Wraps a Gemini API call with an exponential backoff retry mechanism to handle rate limiting (429 errors).
 * @param requestFn A function that returns the promise from the Gemini API call.
 * @returns The result of the API call.
 * @throws Throws a user-friendly error if all retries fail, or the original error for non-rate-limit issues.
 */
const callGeminiWithRetry = async (requestFn: () => Promise<GenerateContentResponse>): Promise<GenerateContentResponse> => {
    let lastError: any;
    for (let i = 0; i < MAX_RETRIES; i++) {
        try {
            return await requestFn();
        } catch (error: any) {
            lastError = error;
            const errorString = (error?.toString() ?? '').toLowerCase();
            const isRateLimitError = errorString.includes('429') || errorString.includes('resource_exhausted') || errorString.includes('quota');

            if (isRateLimitError) {
                if (i < MAX_RETRIES - 1) {
                    const delay = INITIAL_BACKOFF_MS * Math.pow(2, i) + Math.random() * 1000; // Add jitter
                    console.warn(`Rate limit exceeded. Retrying in ${Math.round(delay / 1000)}s... (Attempt ${i + 2}/${MAX_RETRIES})`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            } else {
                console.error('A non-retriable error occurred:', error);
                throw error; // Rethrow original error for non-rate-limit issues
            }
        }
    }
    
    // This code is reached only if all retries failed due to rate limiting.
    console.error(`AI request failed after ${MAX_RETRIES} retries due to persistent rate limiting.`, lastError);
    throw new Error('Hệ thống AI đang tạm thời quá tải. Vui lòng thử lại sau ít phút.');
};


const getCustomizationPrompt = (field: string, tone: string, detail: string): string => {
    const fieldMap: Record<string, string> = {
        'default': 'hành chính thông thường',
        'law': 'pháp lý, luật',
        'medical': 'y tế, y khoa',
        'military': 'quân đội, an ninh',
        'culture': 'văn hóa, giáo dục',
        'technical': 'kỹ thuật, công nghệ'
    };

    const toneMap: Record<string, string> = {
        'formal': 'trang trọng, chính thức',
        'assertive': 'quả quyết, mạnh mẽ',
        'neutral': 'trung lập, khách quan',
        'friendly': 'thân thiện, gần gũi'
    };
    
    const detailMap: Record<string, string> = {
        'standard': 'đầy đủ, chuẩn mực',
        'concise': 'ngắn gọn, súc tích',
        'detailed': 'chi tiết, cụ thể'
    };

    return `\nYêu cầu về văn phong:
- Chuyên ngành: Sử dụng thuật ngữ của ngành ${fieldMap[field] || 'hành chính'}.
- Giọng văn: ${toneMap[tone] || 'trang trọng'}.
- Mức độ chi tiết: ${detailMap[detail] || 'chuẩn mực'}.`;
}

export const generateDocumentContentWithAI = async (purpose: string, data: string, docType: DocumentType, field: string, tone: string, detail: string): Promise<GeneratedDraft> => {
    const ai = getAIClient();

    const systemInstruction = `Bạn là một trợ lý ảo chuyên soạn thảo văn bản hành chính tại Việt Nam, am hiểu sâu sắc Nghị định 30/2020/NĐ-CP.
Nhiệm vụ của bạn là dựa vào mục đích, dữ liệu, loại văn bản và các tùy chỉnh văn phong người dùng cung cấp để soạn thảo các phần nội dung chính của một văn bản hoàn chỉnh.
Hãy trả về kết quả dưới dạng một đối tượng JSON tuân thủ theo cấu trúc đã định nghĩa.
- "subject": Trích yếu nội dung, ngắn gọn, trang trọng.
- "rawContent": Nội dung chính của văn bản, viết theo văn phong hành chính chuẩn mực, sử dụng các căn cứ pháp lý phù hợp nếu có thể.
- "recipients": Đề xuất nơi nhận phù hợp.
- "signerTitle": Đề xuất chức danh người ký phù hợp (viết IN HOA).
`;

    const customization = getCustomizationPrompt(field, tone, detail);
    const contents = `Hãy soạn thảo một văn bản dựa trên các thông tin sau:
- **Loại văn bản:** ${docType}
- **Mục đích chính:** ${purpose}
- **Dữ liệu bổ sung (nếu có):** ${data || "Không có"}
- **Tùy chỉnh văn phong:** ${customization}
`;

    const responseSchema = {
        type: Type.OBJECT,
        properties: {
            subject: {
                type: Type.STRING,
                description: "Trích yếu nội dung của văn bản."
            },
            rawContent: {
                type: Type.STRING,
                description: "Toàn bộ nội dung chính của văn bản, được viết theo văn phong hành chính trang trọng."
            },
            recipients: {
                type: Type.STRING,
                description: "Danh sách nơi nhận, mỗi nơi nhận trên một dòng, bắt đầu bằng dấu gạch ngang. Ví dụ: '- Như trên;\\n- Lưu: VT.'"
            },
            signerTitle: {
                type: Type.STRING,
                description: "Chức danh của người ký, viết IN HOA. Ví dụ: 'TRƯỞNG PHÒNG'."
            }
        },
        required: ["subject", "rawContent", "recipients", "signerTitle"]
    };

    try {
        const response = await callGeminiWithRetry(() => ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: contents,
            config: {
                systemInstruction: systemInstruction,
                temperature: 0.6,
                responseMimeType: "application/json",
                responseSchema: responseSchema,
            }
        }));

        const jsonStr = response.text.trim();
        const parsedResult = JSON.parse(jsonStr);
        return parsedResult as GeneratedDraft;

    } catch (error: any) {
        console.error('Lỗi gọi Gemini API (generate draft):', error);
        throw new Error(error.message || 'AI không thể tạo nội dung. Vui lòng thử lại với yêu cầu rõ ràng hơn.');
    }
};

export const formalizeContentWithAI = async (rawContent: string): Promise<string> => {
    const ai = getAIClient();
    
    const systemInstruction = `Bạn là một chuyên viên văn thư lưu trữ chuyên nghiệp của Việt Nam, có kiến thức sâu sắc về Nghị định 30/2020/NĐ-CP.
Nhiệm vụ của bạn là diễn giải lại nội dung văn bản thô được cung cấp thành văn phong hành chính trang trọng, mạch lạc, rõ ràng và chuẩn mực của Việt Nam, không mắc lỗi chính tả.
Chỉ trả về phần nội dung chính đã được soạn lại, không thêm "Kính gửi", "Căn cứ", tiêu đề, chữ ký hay bất kỳ phần nào khác của văn bản.
Sử dụng ngắt dòng (\n) để tạo các đoạn văn hợp lý.
Ví dụ: nếu nhận được "phòng X đề nghị duyệt chi 10 triệu mua máy tính", bạn nên trả về một đoạn văn như: "Phòng X kính đề nghị Ban Giám đốc xem xét, phê duyệt chủ trương chi kinh phí mua sắm 01 máy vi tính để bàn với tổng giá trị dự kiến là 10.000.000 VNĐ (Mười triệu đồng chẵn) để phục vụ công tác chuyên môn."`;

    try {
        const response = await callGeminiWithRetry(() => ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: `Dựa trên nội dung thô sau đây, hãy soạn lại thành nội dung văn bản hành chính hoàn chỉnh, trang trọng. Giữ lại các thông tin cốt lõi như kinh phí, thời gian và mục đích.\n\nNội dung thô:\n"${rawContent}"`,
            config: {
                systemInstruction: systemInstruction,
                temperature: 0.5,
            }
        }));

        return response.text;
    } catch (error: any) {
        console.error('Lỗi gọi Gemini API (formalize):', error);
        throw new Error(error.message || 'Không thể định dạng nội dung từ AI.');
    }
};

export const suggestFormattingWithAI = async (processedContent: string): Promise<string> => {
    const ai = getAIClient();
    
    const systemInstruction = `Bạn là một chuyên gia về trình bày văn bản hành chính Việt Nam theo Nghị định 30/2020/NĐ-CP.
Nhiệm vụ của bạn là định dạng lại văn bản được cung cấp để tăng tính rõ ràng và chuyên nghiệp.
Sử dụng Markdown để định dạng. Cụ thể:
- Dùng **dấu sao kép** để **in đậm** các thông tin quan trọng như: số tiền, ngày tháng, thời hạn, địa điểm, tên riêng, hoặc các cụm từ cần nhấn mạnh.
- Dùng dấu gạch đầu dòng (- ) cho các danh sách liệt kê. Mỗi mục trên một dòng riêng.
- Giữ nguyên toàn bộ nội dung, câu chữ, và cấu trúc đoạn văn của văn bản gốc. KHÔNG được thêm, bớt, hay thay đổi bất kỳ từ nào. Chỉ thêm mã Markdown.
- KHÔNG thêm bất kỳ lời giải thích nào. Chỉ trả về văn bản đã được định dạng.`;

    try {
        const response = await callGeminiWithRetry(() => ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: `Hãy định dạng văn bản sau bằng Markdown:\n\n---\n${processedContent}\n---`,
            config: {
                systemInstruction: systemInstruction,
                temperature: 0.2,
            }
        }));

        return response.text;
    } catch (error: any) {
        console.error('Lỗi gọi Gemini API (suggest formatting):', error);
        // Fallback to original content if formatting fails
        return processedContent;
    }
};

export const proofreadWithAI = async (rawContent: string): Promise<string> => {
    const ai = getAIClient();
    
    const systemInstruction = `Bạn là một trợ lý biên tập chuyên nghiệp, chuyên về văn phong hành chính của Việt Nam. Nhiệm vụ của bạn là kiểm tra và sửa tất cả các lỗi chính tả, ngữ pháp, và dấu câu trong văn bản được cung cấp.
Hãy điều chỉnh câu văn cho mạch lạc, trang trọng và chuyên nghiệp hơn nếu cần, nhưng phải giữ nguyên tuyệt đối ý nghĩa cốt lõi của văn bản gốc.
Chỉ trả về văn bản đã được sửa lỗi hoàn chỉnh. Không thêm bất kỳ lời giải thích, ghi chú, tiêu đề, hay định dạng nào khác.`;

    try {
        const response = await callGeminiWithRetry(() => ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: `Vui lòng kiểm tra và sửa lỗi cho đoạn văn bản sau đây:\n\n---\n${rawContent}\n---`,
            config: {
                systemInstruction: systemInstruction,
                temperature: 0.3,
            }
        }));

        return response.text.trim();
    } catch (error: any) {
        console.error('Lỗi gọi Gemini API (proofread):', error);
        throw new Error(error.message || 'Không thể kiểm tra chính tả & ngữ pháp bằng AI.');
    }
};


export const extractTextFromImage = async (base64Image: string, mimeType: string): Promise<string> => {
    const ai = getAIClient();
    
    const imagePart = {
        inlineData: {
            data: base64Image,
            mimeType: mimeType,
        },
    };

    const textPart = {
        text: "Trích xuất toàn bộ văn bản từ hình ảnh này. Chỉ trả về nội dung văn bản, không thêm bất kỳ lời giải thích hay định dạng nào.",
    };

    try {
        const response = await callGeminiWithRetry(() => ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: { parts: [imagePart, textPart] },
        }));
        return response.text;
    } catch (error: any) {
        console.error('Lỗi gọi Gemini API (extract text):', error);
        throw new Error(error.message || 'Không thể trích xuất văn bản từ hình ảnh.');
    }
};

export const analyzeText = async (documentText: string, userPrompt: string, field: string, tone: string, detail: string): Promise<string> => {
    const ai = getAIClient();

    const systemInstruction = "Bạn là một trợ lý AI chuyên phân tích văn bản. Dựa vào nội dung văn bản được cung cấp, yêu cầu của người dùng, và các tùy chỉnh văn phong, hãy đưa ra câu trả lời chính xác, chi tiết, hữu ích và được trình bày rõ ràng.";

    const customization = getCustomizationPrompt(field, tone, detail);
    const contents = `**VĂN BẢN CẦN PHÂN TÍCH:**
---
${documentText}
---

**YÊU CẦU PHÂN TÍCH CỦA NGƯỜI DÙNG:**
---
${userPrompt}
---

**TÙY CHỈNH VĂN PHONG PHẢN HỒI:**
---
${customization}
---

Hãy thực hiện yêu cầu trên.`;

    try {
         const response = await callGeminiWithRetry(() => ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: contents,
            config: {
                systemInstruction: systemInstruction,
                temperature: 0.6,
            }
        }));
        return response.text;
    } catch (error: any) {
        console.error('Lỗi gọi Gemini API (analyze):', error);
        throw new Error(error.message || 'Không thể phân tích văn bản.');
    }
};
