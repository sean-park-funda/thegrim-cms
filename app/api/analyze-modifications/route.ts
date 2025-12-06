import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { supabase } from '@/lib/supabase';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

interface AnalyzeModificationsRequest {
  originalFileId?: string; // 원본 이미지 파일 ID (files 테이블)
  fileId?: string; // 수정사항이 표시된 이미지 파일 ID (files 테이블)
  referenceFileId?: string; // 레퍼런스 이미지 파일 ID (reference_files 테이블) - 하위 호환성
  referenceImageUrl?: string; // 레퍼런스 이미지 URL (하위 호환성)
  referenceImageBase64?: string; // 레퍼런스 이미지 base64 데이터 (하위 호환성)
  referenceImageMimeType?: string; // 레퍼런스 이미지 MIME 타입 (하위 호환성)
  hint?: string; // 수정사항 힌트
  customPrompt?: string; // 사용자가 수정한 프롬프트
}

interface AnalyzeModificationsResponse {
  prompt: string; // 생성된 JSON 프롬프트
  modificationPlan: string; // 수정 계획 설명
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  console.log('[수정사항 분석] 분석 요청 시작');

  try {
    if (!GEMINI_API_KEY) {
      console.error('[수정사항 분석] GEMINI_API_KEY가 설정되지 않음');
      return NextResponse.json(
        { error: 'GEMINI_API_KEY가 설정되지 않았습니다.' },
        { status: 500 }
      );
    }

    const body: AnalyzeModificationsRequest = await request.json();
    const {
      originalFileId,
      fileId,
      referenceFileId,
      referenceImageUrl,
      referenceImageBase64,
      referenceImageMimeType,
      hint,
      customPrompt,
    } = body;

    // 원본 이미지와 수정사항 이미지 가져오기
    let originalImageBase64: string | undefined;
    let originalMimeType: string | undefined;
    let modifiedImageBase64: string | undefined;
    let modifiedMimeType: string | undefined;
    
    // 하위 호환성을 위한 변수
    let refImageBase64: string = '';
    let refMimeType: string = '';

    // 새로운 방식: originalFileId와 fileId가 모두 있는 경우
    if (originalFileId && fileId) {
      console.log('[수정사항 분석] 2개 이미지 방식: 원본 이미지와 수정사항 이미지');
      
      // 원본 이미지 다운로드
      console.log('[수정사항 분석] 원본 이미지 다운로드 시작...');
      const { data: originalFile, error: originalFileError } = await supabase
        .from('files')
        .select('file_path, file_type')
        .eq('id', originalFileId)
        .single();

      if (originalFileError || !originalFile) {
        console.error('[수정사항 분석] 원본 파일 조회 실패:', originalFileError);
        return NextResponse.json(
          { error: '원본 파일을 찾을 수 없습니다.' },
          { status: 404 }
        );
      }

      if (originalFile.file_type !== 'image') {
        return NextResponse.json(
          { error: '원본 파일은 이미지 파일이어야 합니다.' },
          { status: 400 }
        );
      }

      const originalFilePath = originalFile.file_path?.startsWith('http')
        ? originalFile.file_path
        : originalFile.file_path?.startsWith('/')
          ? originalFile.file_path
          : `https://${originalFile.file_path}`;
      
      const originalImageResponse = await fetch(originalFilePath);
      if (!originalImageResponse.ok) {
        console.error('[수정사항 분석] 원본 이미지 다운로드 실패');
        return NextResponse.json(
          { error: '원본 이미지를 가져올 수 없습니다.' },
          { status: 400 }
        );
      }

      const originalArrayBuffer = await originalImageResponse.arrayBuffer();
      originalImageBase64 = Buffer.from(originalArrayBuffer).toString('base64');
      originalMimeType = originalImageResponse.headers.get('content-type') || 'image/jpeg';

      // 수정사항 이미지 다운로드
      console.log('[수정사항 분석] 수정사항 이미지 다운로드 시작...');
      const { data: modifiedFile, error: modifiedFileError } = await supabase
        .from('files')
        .select('file_path, file_type')
        .eq('id', fileId)
        .single();

      if (modifiedFileError || !modifiedFile) {
        console.error('[수정사항 분석] 수정사항 파일 조회 실패:', modifiedFileError);
        return NextResponse.json(
          { error: '수정사항 파일을 찾을 수 없습니다.' },
          { status: 404 }
        );
      }

      if (modifiedFile.file_type !== 'image') {
        return NextResponse.json(
          { error: '수정사항 파일은 이미지 파일이어야 합니다.' },
          { status: 400 }
        );
      }

      const modifiedFilePath = modifiedFile.file_path?.startsWith('http')
        ? modifiedFile.file_path
        : modifiedFile.file_path?.startsWith('/')
          ? modifiedFile.file_path
          : `https://${modifiedFile.file_path}`;
      
      const modifiedImageResponse = await fetch(modifiedFilePath);
      if (!modifiedImageResponse.ok) {
        console.error('[수정사항 분석] 수정사항 이미지 다운로드 실패');
        return NextResponse.json(
          { error: '수정사항 이미지를 가져올 수 없습니다.' },
          { status: 400 }
        );
      }

      const modifiedArrayBuffer = await modifiedImageResponse.arrayBuffer();
      modifiedImageBase64 = Buffer.from(modifiedArrayBuffer).toString('base64');
      modifiedMimeType = modifiedImageResponse.headers.get('content-type') || 'image/jpeg';

      console.log('[수정사항 분석] 두 이미지 준비 완료:', {
        originalMimeType,
        originalBase64Length: originalImageBase64.length,
        modifiedMimeType,
        modifiedBase64Length: modifiedImageBase64.length,
      });
    } else if (fileId) {
      // 하위 호환성: 기존 방식 (단일 이미지)
      // 일반 파일 ID로 파일 정보 조회
      console.log('[수정사항 분석] 파일 ID로 파일 정보 조회 시작...');
      const { data: refFile, error: refFileError } = await supabase
        .from('files')
        .select('file_path, file_type')
        .eq('id', fileId)
        .single();

      if (refFileError || !refFile) {
        console.error('[수정사항 분석] 파일 조회 실패:', refFileError);
        return NextResponse.json(
          { error: '파일을 찾을 수 없습니다.' },
          { status: 404 }
        );
      }

      if (refFile.file_type !== 'image') {
        return NextResponse.json(
          { error: '이미지 파일만 분석할 수 있습니다.' },
          { status: 400 }
        );
      }

      console.log('[수정사항 분석] 이미지 다운로드 시작...');
      const filePath = refFile.file_path?.startsWith('http')
        ? refFile.file_path
        : refFile.file_path?.startsWith('/')
          ? refFile.file_path
          : `https://${refFile.file_path}`;
      
      const refImageResponse = await fetch(filePath);

      if (!refImageResponse.ok) {
        console.error('[수정사항 분석] 이미지 다운로드 실패:', {
          status: refImageResponse.status,
          statusText: refImageResponse.statusText,
        });
        return NextResponse.json(
          { error: '이미지를 가져올 수 없습니다.' },
          { status: 400 }
        );
      }

      const refArrayBuffer = await refImageResponse.arrayBuffer();
      refImageBase64 = Buffer.from(refArrayBuffer).toString('base64');
      refMimeType = refImageResponse.headers.get('content-type') || 'image/jpeg';
    } else if (referenceFileId) {
      // 레퍼런스 파일 ID로 파일 정보 조회
      console.log('[수정사항 분석] 레퍼런스 파일 ID로 파일 정보 조회 시작...');
      const { data: refFile, error: refFileError } = await supabase
        .from('reference_files')
        .select('file_path, file_type')
        .eq('id', referenceFileId)
        .single();

      if (refFileError || !refFile) {
        console.error('[수정사항 분석] 레퍼런스 파일 조회 실패:', refFileError);
        return NextResponse.json(
          { error: '레퍼런스 파일을 찾을 수 없습니다.' },
          { status: 404 }
        );
      }

      if (refFile.file_type !== 'image') {
        return NextResponse.json(
          { error: '이미지 파일만 분석할 수 있습니다.' },
          { status: 400 }
        );
      }

      console.log('[수정사항 분석] 레퍼런스 이미지 다운로드 시작...');
      const refImageResponse = await fetch(refFile.file_path);

      if (!refImageResponse.ok) {
        console.error('[수정사항 분석] 레퍼런스 이미지 다운로드 실패:', {
          status: refImageResponse.status,
          statusText: refImageResponse.statusText,
        });
        return NextResponse.json(
          { error: '레퍼런스 이미지를 가져올 수 없습니다.' },
          { status: 400 }
        );
      }

      const refArrayBuffer = await refImageResponse.arrayBuffer();
      refImageBase64 = Buffer.from(refArrayBuffer).toString('base64');
      refMimeType = refImageResponse.headers.get('content-type') || 'image/jpeg';
    } else if (referenceImageBase64) {
      console.log('[수정사항 분석] 레퍼런스 이미지 base64 데이터 사용');
      refImageBase64 = referenceImageBase64;
      refMimeType = referenceImageMimeType || 'image/png';
    } else if (referenceImageUrl) {
      console.log('[수정사항 분석] 레퍼런스 이미지 다운로드 시작...');
      const refImageResponse = await fetch(referenceImageUrl);

      if (!refImageResponse.ok) {
        console.error('[수정사항 분석] 레퍼런스 이미지 다운로드 실패:', {
          status: refImageResponse.status,
          statusText: refImageResponse.statusText,
          url: referenceImageUrl,
        });
        return NextResponse.json(
          { error: '레퍼런스 이미지를 가져올 수 없습니다.' },
          { status: 400 }
        );
      }

      const refArrayBuffer = await refImageResponse.arrayBuffer();
      refImageBase64 = Buffer.from(refArrayBuffer).toString('base64');
      refMimeType = refImageResponse.headers.get('content-type') || 'image/jpeg';
    } else {
      if (originalFileId && fileId) {
        // 새로운 방식: 두 개의 이미지를 사용하므로 refImageBase64는 사용하지 않음
        refImageBase64 = '';
        refMimeType = '';
      } else {
        console.error('[수정사항 분석] 이미지가 없음');
        return NextResponse.json(
          { error: '원본 이미지와 수정사항 이미지가 필요합니다. (originalFileId와 fileId를 모두 제공해주세요.)' },
          { status: 400 }
        );
      }
    }

    // 하위 호환성 로그
    if (!(originalFileId && fileId) && refImageBase64 && refMimeType) {
      console.log('[수정사항 분석] 레퍼런스 이미지 준비 완료 (하위 호환성):', {
        mimeType: refMimeType,
        base64Length: refImageBase64.length,
      });
    }

    // Gemini API 호출
    console.log('[수정사항 분석] Gemini API 호출 시작...');
    const geminiRequestStart = Date.now();

    const ai = new GoogleGenAI({
      apiKey: GEMINI_API_KEY,
    });

    const model = 'gemini-3-pro-preview';

    // 프롬프트 구성
    // 프론트엔드에서 보낸 프롬프트를 그대로 사용 (기본 프롬프트는 프론트엔드에서 관리)
    if (!customPrompt || !customPrompt.trim()) {
      return NextResponse.json(
        { error: '분석 프롬프트가 필요합니다.' },
        { status: 400 }
      );
    }

    const hintText = hint ? ` (에디터 요구 사항 : ${hint})` : '';
    const prompt = customPrompt.trim() + hintText;

    // 새로운 방식 (2개 이미지)과 기존 방식 (1개 이미지) 구분
    const isTwoImageMode = originalFileId && fileId;

    const config = {
      responseModalities: ['TEXT'],
      temperature: 0.7,
      topP: 0.95,
      topK: 40,
      maxOutputTokens: 8192,
    };

    // contents 배열 구성: 새로운 방식(2개 이미지) 또는 기존 방식(1개 이미지)
    const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [
      {
        text: prompt,
      },
    ];

    if (isTwoImageMode) {
      // 새로운 방식: 원본 이미지와 수정사항 이미지 두 개 추가
      if (!originalImageBase64 || !originalMimeType || !modifiedImageBase64 || !modifiedMimeType) {
        return NextResponse.json(
          { error: '이미지 데이터를 준비하는 중 오류가 발생했습니다.' },
          { status: 500 }
        );
      }
      parts.push(
        {
          inlineData: {
            mimeType: originalMimeType,
            data: originalImageBase64,
          },
        },
        {
          inlineData: {
            mimeType: modifiedMimeType,
            data: modifiedImageBase64,
          },
        }
      );
    } else {
      // 기존 방식: 단일 이미지 사용
      if (!refImageBase64 || !refMimeType) {
        return NextResponse.json(
          { error: '레퍼런스 이미지 데이터를 준비하는 중 오류가 발생했습니다.' },
          { status: 500 }
        );
      }
      parts.push({
        inlineData: {
          mimeType: refMimeType,
          data: refImageBase64,
        },
      });
    }

    const contents = [
      {
        role: 'user' as const,
        parts,
      },
    ];

    const response = await ai.models.generateContentStream({
      model,
      config,
      contents,
    });

    // 스트림에서 모든 chunk 수집
    let responseText = '';
    for await (const chunk of response) {
      if (!chunk.candidates || !chunk.candidates[0]?.content?.parts) {
        continue;
      }

      const parts = chunk.candidates[0].content.parts;

      for (const part of parts) {
        if (part.text) {
          responseText += part.text;
        }
      }
    }

    const geminiRequestTime = Date.now() - geminiRequestStart;
    console.log('[수정사항 분석] Gemini API 응답:', {
      requestTime: `${geminiRequestTime}ms`,
      responseLength: responseText.length,
    });

    if (!responseText) {
      console.error('[수정사항 분석] 응답 텍스트가 없음');
      return NextResponse.json(
        { error: '분석 결과를 받을 수 없습니다.' },
        { status: 500 }
      );
    }

    // JSON 파싱 시도
    console.log('[수정사항 분석] JSON 파싱 시작...');
    let analysisResult: AnalyzeModificationsResponse;
    try {
      // 응답 텍스트에서 JSON 부분만 추출 (마크다운 코드 블록 제거)
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        analysisResult = JSON.parse(jsonMatch[0]);
        console.log('[수정사항 분석] JSON 파싱 성공:', {
          hasPrompt: !!analysisResult.prompt,
          hasModificationPlan: !!analysisResult.modificationPlan,
        });
      } else {
        throw new Error('JSON을 찾을 수 없습니다.');
      }
    } catch (parseError) {
      console.error('[수정사항 분석] JSON 파싱 오류:', parseError);
      console.error('[수정사항 분석] 전체 응답 텍스트:', responseText);
      return NextResponse.json(
        {
          error: '분석 결과를 파싱할 수 없습니다.',
          details: {
            parseError: parseError instanceof Error ? parseError.message : String(parseError),
            responseText: responseText.substring(0, 1000), // 처음 1000자만
          },
        },
        { status: 500 }
      );
    }

    // 결과 검증
    console.log('[수정사항 분석] 결과 검증 시작...');
    if (!analysisResult.prompt || !analysisResult.modificationPlan) {
      console.error('[수정사항 분석] 결과 형식 오류:', {
        hasPrompt: !!analysisResult.prompt,
        hasModificationPlan: !!analysisResult.modificationPlan,
        result: analysisResult,
      });
      return NextResponse.json(
        {
          error: '분석 결과 형식이 올바르지 않습니다.',
          details: {
            received: analysisResult,
          },
        },
        { status: 500 }
      );
    }

    const totalTime = Date.now() - startTime;
    console.log('[수정사항 분석] 분석 완료:', {
      totalTime: `${totalTime}ms`,
      promptLength: analysisResult.prompt.length,
      modificationPlanLength: analysisResult.modificationPlan.length,
    });

    return NextResponse.json(analysisResult);
  } catch (error: unknown) {
    const totalTime = Date.now() - startTime;
    console.error('[수정사항 분석] 예외 발생:', {
      error,
      errorType: error instanceof Error ? error.constructor.name : typeof error,
      errorMessage: error instanceof Error ? error.message : String(error),
      errorStack: error instanceof Error ? error.stack : undefined,
      totalTime: `${totalTime}ms`,
    });
    const errorMessage =
      error instanceof Error
        ? error.message
        : '수정사항 분석 중 오류가 발생했습니다.';
    return NextResponse.json(
      {
        error: errorMessage,
        details: {
          errorType: error instanceof Error ? error.constructor.name : typeof error,
        },
      },
      { status: 500 }
    );
  }
}

