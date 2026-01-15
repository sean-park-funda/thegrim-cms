import { NextRequest, NextResponse } from 'next/server';
import { generateGeminiImage } from '@/lib/image-generation';
import { supabase } from '@/lib/supabase';
import sharp from 'sharp';
import crypto from 'crypto';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_API_TIMEOUT = 120000; // 120초

// MIME 타입에서 확장자 추출
function getExtensionFromMimeType(mimeType: string): string {
  const mimeToExt: Record<string, string> = {
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/gif': '.gif',
    'image/webp': '.webp',
  };
  return mimeToExt[mimeType] || '.png';
}

export async function POST(request: NextRequest) {
  try {
    if (!GEMINI_API_KEY) {
      return NextResponse.json(
        { error: 'GEMINI_API_KEY가 설정되지 않았습니다.' },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { characterSheetImage, poseImage, aspectRatio, cutId, episodeId, processId, createdBy, webtoonId, additionalPrompt } = body;

    if (!characterSheetImage || !poseImage) {
      return NextResponse.json(
        { error: '캐릭터 시트 이미지와 자세 이미지가 필요합니다.' },
        { status: 400 }
      );
    }

    // cutId와 processId가 없으면 기본값 찾기 또는 생성
    let finalCutId = cutId;
    let finalProcessId = processId;

    if (!finalCutId || !finalProcessId) {
      // processId가 없으면 첫 번째 공정 사용
      if (!finalProcessId) {
        const { data: processes, error: processError } = await supabase
          .from('processes')
          .select('id')
          .order('order_index', { ascending: true })
          .limit(1);
        
        if (!processError && processes && processes.length > 0) {
          finalProcessId = processes[0].id;
        }
      }

      // cutId가 없으면 webtoonId로 기본 cut 찾기 또는 생성
      if (!finalCutId && webtoonId) {
        // 웹툰의 "기타" 회차 찾기 (episode_number = 0)
        const { data: episode, error: episodeError } = await supabase
          .from('episodes')
          .select('id')
          .eq('webtoon_id', webtoonId)
          .eq('episode_number', 0)
          .single();

        if (!episodeError && episode) {
          // "기타" 회차의 첫 번째 cut 찾기
          const { data: cut, error: cutError } = await supabase
            .from('cuts')
            .select('id')
            .eq('episode_id', episode.id)
            .order('cut_number', { ascending: true })
            .limit(1)
            .single();

          if (!cutError && cut) {
            finalCutId = cut.id;
          } else if (finalProcessId) {
            // cut이 없으면 생성
            const { data: newCut, error: createCutError } = await supabase
              .from('cuts')
              .insert({
                episode_id: episode.id,
                cut_number: 1,
                title: '기타',
                description: '캐릭터 자세 만들기로 생성된 이미지용 컷',
              })
              .select()
              .single();

            if (!createCutError && newCut) {
              finalCutId = newCut.id;
            }
          }
        } else if (finalProcessId) {
          // "기타" 회차가 없으면 생성
          const { data: newEpisode, error: createEpisodeError } = await supabase
            .from('episodes')
            .insert({
              webtoon_id: webtoonId,
              episode_number: 0,
              title: '기타',
              description: '어떤 회차에도 속하지 않는 컷과 파일을 관리하는 회차입니다.',
              status: 'active',
            })
            .select()
            .single();

          if (!createEpisodeError && newEpisode) {
            // cut 생성
            const { data: newCut, error: createCutError } = await supabase
              .from('cuts')
              .insert({
                episode_id: newEpisode.id,
                cut_number: 1,
                title: '기타',
                description: '캐릭터 자세 만들기로 생성된 이미지용 컷',
              })
              .select()
              .single();

            if (!createCutError && newCut) {
              finalCutId = newCut.id;
            }
          }
        }
      }
    }

    // Gemini API 호출
    let prompt = 'Make the person in image 1 do the exact same pose of the person in image 2.\nChanging the style and background of the image of the person in image 1 is undesirable, so don\'t do it.\nThe new pose should be pixel accurate to the pose we are trying to copy.\nThe position of the arms and head and legs should be the same as the pose we are trying to copy.\nChange the field of view and angle to match exactly image 2.\nHead tilt and eye gaze pose should match the person in image 2';
    
    // 추가 프롬프트가 있으면 보조적으로 추가 (자세와 구도는 변경하지 않음)
    if (additionalPrompt && additionalPrompt.trim()) {
      prompt += `\n\nNote: ${additionalPrompt.trim()} (This description should only apply to auxiliary elements such as emotions, expressions, and atmosphere, without changing the pose and composition. The pose and composition of image 2 must be strictly maintained.)`;
    }

    const contents = [
      {
        role: 'user' as const,
        parts: [
          { text: prompt },
          {
            inlineData: {
              mimeType: characterSheetImage.mimeType || 'image/png',
              data: characterSheetImage.base64,
            },
          },
          {
            inlineData: {
              mimeType: poseImage.mimeType || 'image/png',
              data: poseImage.base64,
            },
          },
        ],
      },
    ];

    // aspectRatio에 따라 이미지 비율 설정
    let imageAspectRatio: string | undefined = undefined;
    if (aspectRatio === 'landscape') {
      imageAspectRatio = '16:9';
    } else if (aspectRatio === 'square') {
      imageAspectRatio = '1:1';
    } else if (aspectRatio === 'portrait') {
      imageAspectRatio = '9:16';
    }

    console.log('[3D 캐릭터 변환] Gemini API 호출 시작...');
    const startTime = Date.now();

    const { base64: imageBase64, mimeType } = await generateGeminiImage({
      provider: 'gemini',
      model: 'gemini-3-pro-image-preview',
      contents,
      config: {
        responseModalities: ['IMAGE', 'TEXT'],
        imageConfig: {
          imageSize: '1K',
          ...(imageAspectRatio ? { aspectRatio: imageAspectRatio } : {}),
        },
        temperature: 1.0,
        topP: 0.95,
        topK: 40,
        maxOutputTokens: 32768,
      },
      timeoutMs: GEMINI_API_TIMEOUT,
      retries: 3,
    });

    const elapsedTime = Date.now() - startTime;
    console.log(`[3D 캐릭터 변환] Gemini API 호출 완료 (${elapsedTime}ms)`);

    // cutId와 processId가 있으면 임시 파일로 저장
    let fileId: string | null = null;
    let filePath: string | null = null;
    let fileUrl: string | null = null;

    if (finalCutId && finalProcessId) {
      try {
        // base64 데이터를 Buffer로 변환
        const imageBuffer = Buffer.from(imageBase64, 'base64');
        
        // 파일명 생성
        const extension = getExtensionFromMimeType(mimeType);
        const uuid = crypto.randomUUID().substring(0, 8);
        const timestamp = Date.now();
            const fileName = `character-pose-${timestamp}-${uuid}${extension}`;
            const storagePath = `${finalCutId}/${finalProcessId}/${fileName}`;
        
        console.log('[3D 캐릭터 변환] 임시 파일 저장 시작:', storagePath);
        
        // Storage에 업로드
        const { error: uploadError } = await supabase.storage
          .from('webtoon-files')
          .upload(storagePath, imageBuffer, {
            contentType: mimeType,
            upsert: false,
          });

        if (uploadError) {
          console.error('[3D 캐릭터 변환] 임시 파일 저장 실패:', uploadError);
          // 저장 실패해도 base64는 반환
        } else {
          // 파일 URL 생성
          const { data: urlData } = supabase.storage
            .from('webtoon-files')
            .getPublicUrl(storagePath);
          fileUrl = urlData.publicUrl;
          filePath = storagePath;

          // 이미지 메타데이터 추출
          let imageWidth: number | undefined;
          let imageHeight: number | undefined;
          try {
            const metadata = await sharp(imageBuffer).metadata();
            imageWidth = metadata.width;
            imageHeight = metadata.height;
          } catch (error) {
            console.warn('[3D 캐릭터 변환] 메타데이터 추출 실패:', error);
          }

          // DB에 임시 파일 정보 저장 (is_temp = true)
          const { data: fileData, error: dbError } = await supabase
            .from('files')
            .insert({
              cut_id: finalCutId,
              process_id: finalProcessId,
              file_name: fileName,
              file_path: fileUrl,
              storage_path: storagePath,
              file_size: imageBuffer.length,
              file_type: 'image',
              mime_type: mimeType,
              description: '캐릭터 자세 만들기로 생성된 이미지',
              prompt: prompt,
              created_by: createdBy,
              is_temp: true,
              metadata: {
                width: imageWidth,
                height: imageHeight,
                aspectRatio: aspectRatio,
                source: 'character-pose-maker',
              },
            })
            .select()
            .single();

          if (dbError || !fileData) {
            console.error('[3D 캐릭터 변환] DB 저장 실패:', dbError);
            // Storage 파일은 삭제
            await supabase.storage.from('webtoon-files').remove([storagePath]);
            // 저장 실패해도 base64는 반환
          } else {
            fileId = fileData.id;
            console.log('[3D 캐릭터 변환] 임시 파일 저장 완료:', {
              fileId: fileData.id,
              storagePath,
              fileUrl,
            });
          }
        }
      } catch (saveError) {
        console.error('[3D 캐릭터 변환] 임시 파일 저장 중 오류:', saveError);
        // 저장 실패해도 base64는 반환
      }
    }

    return NextResponse.json({
      success: true,
      image: {
        base64: imageBase64,
        mimeType: mimeType,
      },
      fileId: fileId,
      filePath: filePath,
      fileUrl: fileUrl,
    });
  } catch (error) {
    console.error('[3D 캐릭터 변환] 오류:', error);
    const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.';
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
