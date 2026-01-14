'use client';

import { useState, useCallback, useEffect } from 'react';
import { useImageModel } from '@/lib/contexts/ImageModelContext';
import { useStore } from '@/lib/store/useStore';
import { FreeCreationChatHistory } from './FreeCreationChatHistory';
import { FreeCreationPromptInput } from './FreeCreationPromptInput';
import { FreeCreationSidebar } from './FreeCreationSidebar';
import { ImageViewer } from '@/components/ImageViewer';
import {
  FreeCreationSession,
  FreeCreationMessageWithFile,
  FreeCreationRecentReferenceWithFile,
  ReferenceFile,
  Process,
} from '@/lib/supabase';
import {
  getOrCreateFreeCreationSession,
  getFreeCreationSession,
  getFreeCreationMessages,
  createFreeCreationMessage,
  getFreeCreationRecentReferences,
} from '@/lib/api/freeCreation';
import { getProcesses } from '@/lib/api/processes';
import { getReferenceFilesByWebtoon, uploadReferenceFile, deleteReferenceFile } from '@/lib/api/referenceFiles';
import { SelectedCharacterSheet } from '@/components/CharacterSheetSelectDialog';
import { Loader2 } from 'lucide-react';

interface FreeCreationPlaygroundProps {
  webtoonId: string;
  sessionId?: string;
  readOnly?: boolean;
}

export function FreeCreationPlayground({ webtoonId, sessionId, readOnly }: FreeCreationPlaygroundProps) {
  const { profile } = useStore();
  const { model: globalModel } = useImageModel();

  // 상태
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<FreeCreationSession | null>(null);
  const [messages, setMessages] = useState<FreeCreationMessageWithFile[]>([]);
  const [recentReferences, setRecentReferences] = useState<FreeCreationRecentReferenceWithFile[]>([]);
  const [selectedReferences, setSelectedReferences] = useState<ReferenceFile[]>([]);
  const [selectedReferenceIds, setSelectedReferenceIds] = useState<Set<string>>(new Set());
  const [processes, setProcesses] = useState<Process[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [initialPrompt, setInitialPrompt] = useState<string | undefined>(undefined);
  const [initialAspectRatio, setInitialAspectRatio] = useState<string | undefined>(undefined);
  const [isOwner, setIsOwner] = useState(false);

  // 이미지 뷰어
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerImage, setViewerImage] = useState<{ url: string; name: string } | null>(null);

  // 초기 데이터 로드
  useEffect(() => {
    const loadInitialData = async () => {
      if (!profile?.id) return;

      try {
        setLoading(true);

        // 세션 가져오기
        let sessionData: FreeCreationSession;
        if (sessionId) {
          sessionData = await getFreeCreationSession(sessionId);
        } else {
          // sessionId가 없으면 기존처럼 자동 생성
          sessionData = await getOrCreateFreeCreationSession(webtoonId, profile.id);
        }
        setSession(sessionData);

        // 소유자 확인
        const owner = sessionData.user_id === profile.id;
        setIsOwner(owner);
        const actualReadOnly = readOnly !== undefined ? readOnly : !owner;

        // 병렬로 데이터 로드
        const [messagesData, recentRefsData, processesData] = await Promise.all([
          getFreeCreationMessages(sessionData.id),
          getFreeCreationRecentReferences(sessionData.id),
          actualReadOnly ? Promise.resolve([]) : getProcesses(), // 읽기 전용이면 processes 불필요
        ]);

        setMessages(messagesData);
        setRecentReferences(recentRefsData);
        setProcesses(processesData);
      } catch (error) {
        console.error('[자유창작] 초기 데이터 로드 실패:', error);
      } finally {
        setLoading(false);
      }
    };

    loadInitialData();
  }, [webtoonId, profile?.id, sessionId, readOnly]);

  // 레퍼런스 선택
  const handleReferenceSelect = useCallback((refFile: ReferenceFile) => {
    setSelectedReferences(prev => {
      if (prev.some(r => r.id === refFile.id)) return prev;
      return [...prev, refFile];
    });
    setSelectedReferenceIds(prev => new Set([...prev, refFile.id]));
  }, []);

  // 레퍼런스 선택 해제
  const handleReferenceDeselect = useCallback((referenceId: string) => {
    setSelectedReferences(prev => prev.filter(r => r.id !== referenceId));
    setSelectedReferenceIds(prev => {
      const next = new Set(prev);
      next.delete(referenceId);
      return next;
    });
  }, []);

  // 레퍼런스 업로드 완료
  const handleReferenceUpload = useCallback((file: ReferenceFile) => {
    // 최근 레퍼런스에 추가
    const newRef: FreeCreationRecentReferenceWithFile = {
      id: `temp-${Date.now()}`,
      session_id: session?.id || '',
      reference_file_id: file.id,
      used_at: new Date().toISOString(),
      reference_file: file as unknown as FreeCreationRecentReferenceWithFile['reference_file'],
    };
    setRecentReferences(prev => [newRef, ...prev]);
  }, [session?.id]);

  // 읽기 전용 여부 확인
  const actualReadOnly = readOnly !== undefined ? readOnly : !isOwner;

  // 레퍼런스 삭제
  const handleReferenceDelete = useCallback(async (referenceId: string) => {
    if (actualReadOnly) return;
    
    try {
      await deleteReferenceFile(referenceId);
      
      // 최근 레퍼런스에서 제거
      setRecentReferences(prev => prev.filter(ref => ref.reference_file_id !== referenceId));
      
      // 선택된 레퍼런스에서도 제거
      setSelectedReferences(prev => prev.filter(r => r.id !== referenceId));
      setSelectedReferenceIds(prev => {
        const next = new Set(prev);
        next.delete(referenceId);
        return next;
      });

      // 최근 레퍼런스 새로고침
      if (session) {
        const recentRefsData = await getFreeCreationRecentReferences(session.id);
        setRecentReferences(recentRefsData);
      }
    } catch (error) {
      console.error('[자유창작] 레퍼런스 삭제 실패:', error);
      alert(error instanceof Error ? error.message : '레퍼런스 삭제에 실패했습니다.');
    }
  }, [session, actualReadOnly]);

  // 캐릭터시트에서 레퍼런스 추가
  const handleCharacterSheetsSelected = useCallback(async (sheets: SelectedCharacterSheet[]) => {
    if (actualReadOnly || !profile?.id || processes.length === 0 || sheets.length === 0) return;

    try {
      // 첫 번째 공정 사용
      const processId = processes.sort((a, b) => a.order_index - b.order_index)[0]?.id;
      if (!processId) {
        console.error('[자유창작] 레퍼런스 추가 실패: 공정 ID 없음');
        return;
      }

      // 각 캐릭터시트를 레퍼런스 파일로 변환
      for (const sheet of sheets) {
        try {
          // 이미지 다운로드
          const response = await fetch(sheet.sheetPath);
          if (!response.ok) {
            throw new Error('이미지 다운로드 실패');
          }

          const blob = await response.blob();
          const mimeType = blob.type || 'image/png';

          // Blob을 File로 변환
          const file = new File([blob], sheet.sheetName, { type: mimeType });

          // base64로 변환
          const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });

          // 레퍼런스 파일로 업로드
          const uploadResponse = await fetch('/api/reference-files/upload', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              imageData: dataUrl,
              mimeType,
              fileName: sheet.sheetName,
              webtoonId,
              processId,
              description: `캐릭터시트: ${sheet.characterName}`,
              userId: profile.id,
            }),
          });

          if (!uploadResponse.ok) {
            const error = await uploadResponse.json().catch(() => ({}));
            throw new Error(error.error || '레퍼런스 파일 업로드 실패');
          }

          const { file: uploadedFile } = await uploadResponse.json();
          
          // 레퍼런스 파일을 ReferenceFile 타입으로 변환
          const referenceFile: ReferenceFile = {
            id: uploadedFile.id,
            webtoon_id: webtoonId,
            process_id: processId,
            file_name: uploadedFile.file_name,
            file_path: uploadedFile.file_path,
            storage_path: uploadedFile.storage_path,
            thumbnail_path: null,
            file_size: uploadedFile.file_size,
            file_type: uploadedFile.file_type,
            mime_type: uploadedFile.mime_type,
            description: `캐릭터시트: ${sheet.characterName}`,
            metadata: {},
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };

          // 최근 레퍼런스에 추가
          handleReferenceUpload(referenceFile);
          
          // 자동으로 선택도 추가
          handleReferenceSelect(referenceFile);
        } catch (error) {
          console.error(`[자유창작] 캐릭터시트 "${sheet.sheetName}" 레퍼런스 추가 실패:`, error);
        }
      }
    } catch (error) {
      console.error('[자유창작] 캐릭터시트 레퍼런스 추가 실패:', error);
      alert(error instanceof Error ? error.message : '캐릭터시트 레퍼런스 추가에 실패했습니다.');
    }
  }, [actualReadOnly, profile?.id, processes, webtoonId, handleReferenceUpload, handleReferenceSelect]);

  // 이미지 생성
  const handleSubmit = useCallback(async (prompt: string, aspectRatio: string, imageCount: number) => {
    if (actualReadOnly || !session || !profile?.id) return;

    setIsGenerating(true);

    // 여러 개의 이미지를 생성하기 위한 임시 메시지들
    const tempIds: string[] = [];
    const tempMessages: FreeCreationMessageWithFile[] = [];

    for (let i = 0; i < imageCount; i++) {
      const tempId = `temp-${Date.now()}-${i}`;
      tempIds.push(tempId);
      const tempMessage: FreeCreationMessageWithFile = {
        id: tempId,
        session_id: session.id,
        prompt,
        reference_file_ids: selectedReferences.map(r => r.id),
        generated_file_id: null,
        api_provider: globalModel,
        aspect_ratio: aspectRatio,
        status: 'generating',
        error_message: null,
        created_at: new Date().toISOString(),
        reference_files: selectedReferences as unknown as ReferenceFile[],
      };
      tempMessages.push(tempMessage);
    }

    // 임시 메시지들을 UI에 추가
    setMessages(prev => [...prev, ...tempMessages]);

    try {
      // 여러 개의 이미지를 순차적으로 생성
      const createdMessages: FreeCreationMessageWithFile[] = [];
      
      for (let i = 0; i < imageCount; i++) {
        try {
          const message = await createFreeCreationMessage(session.id, {
            prompt,
            referenceFileIds: selectedReferences.map(r => r.id),
            apiProvider: globalModel,
            aspectRatio,
            userId: profile.id,
            webtoonId,
          });
          createdMessages.push(message);
          
          // 임시 메시지를 실제 메시지로 교체
          setMessages(prev => prev.map(m => m.id === tempIds[i] ? message : m));
        } catch (error) {
          console.error(`[자유창작] 이미지 ${i + 1}/${imageCount} 생성 실패:`, error);
          // 해당 임시 메시지를 에러 상태로 업데이트
          setMessages(prev => prev.map(m => 
            m.id === tempIds[i]
              ? { ...m, status: 'error' as const, error_message: error instanceof Error ? error.message : '생성 실패' }
              : m
          ));
        }
      }

      // 최근 레퍼런스 새로고침
      const recentRefsData = await getFreeCreationRecentReferences(session.id);
      setRecentReferences(recentRefsData);

      // 선택된 레퍼런스 초기화
      setSelectedReferences([]);
      setSelectedReferenceIds(new Set());
      
      // 프롬프트 초기값 초기화
      setInitialPrompt(undefined);
      setInitialAspectRatio(undefined);
    } catch (error) {
      console.error('[자유창작] 메시지 생성 실패:', error);
      // 모든 임시 메시지를 에러 상태로 업데이트
      setMessages(prev => prev.map(m => 
        tempIds.includes(m.id)
          ? { ...m, status: 'error' as const, error_message: error instanceof Error ? error.message : '생성 실패' }
          : m
      ));
    } finally {
      setIsGenerating(false);
    }
  }, [actualReadOnly, session, profile?.id, selectedReferences, globalModel, webtoonId]);

  // 메시지 클릭 - 프롬프트 재설정
  const handleMessageClick = useCallback((message: FreeCreationMessageWithFile) => {
    // 레퍼런스 파일 복원
    const refFiles = (message.reference_files || []) as unknown as ReferenceFile[];
    setSelectedReferences(refFiles);
    setSelectedReferenceIds(new Set(refFiles.map(r => r.id)));
    
    // 프롬프트와 비율 복원
    setInitialPrompt(message.prompt);
    setInitialAspectRatio(message.aspect_ratio);
  }, []);

  // 이미지 클릭 - 이미지 뷰어 열기
  const handleImageClick = useCallback((imageUrl: string, imageName: string) => {
    setViewerImage({ url: imageUrl, name: imageName });
    setViewerOpen(true);
  }, []);

  // 재시도
  const handleRetry = useCallback((message: FreeCreationMessageWithFile) => {
    handleMessageClick(message);
    // 프롬프트 입력창에 포커스하고 프롬프트 설정은 별도로 처리
  }, [handleMessageClick]);

  // 파일 드롭 처리
  const handleFileDrop = useCallback(async (files: File[]) => {
    if (actualReadOnly || !profile?.id || processes.length === 0) return;

    for (const file of files) {
      try {
        // 첫 번째 공정 사용
        const processId = processes.sort((a, b) => a.order_index - b.order_index)[0]?.id;
        if (!processId) continue;

        const uploadedFile = await uploadReferenceFile(file, webtoonId, processId, '자유창작 레퍼런스', profile.id);
        handleReferenceUpload(uploadedFile);
        handleReferenceSelect(uploadedFile);
      } catch (error) {
        console.error('[자유창작] 파일 업로드 실패:', error);
      }
    }
  }, [actualReadOnly, profile?.id, processes, webtoonId, handleReferenceUpload, handleReferenceSelect]);

  // 레퍼런스 추가 버튼 클릭
  const handleReferenceAdd = useCallback(() => {
    // TODO: 레퍼런스 선택 다이얼로그 열기
    // 현재는 좌측 패널에서 선택하도록 안내
  }, []);

  // 생성된 이미지를 레퍼런스로 추가
  const handleAddAsReference = useCallback(async (fileId: string, imageUrl: string, fileName: string) => {
    if (actualReadOnly || !profile?.id || processes.length === 0) {
      console.error('[자유창작] 레퍼런스 추가 실패: 읽기 전용이거나 프로필/공정 정보 없음');
      return;
    }

    try {
      // 첫 번째 공정 사용
      const processId = processes.sort((a, b) => a.order_index - b.order_index)[0]?.id;
      if (!processId) {
        console.error('[자유창작] 레퍼런스 추가 실패: 공정 ID 없음');
        return;
      }

      // 이미지 다운로드
      const response = await fetch(imageUrl);
      if (!response.ok) {
        throw new Error('이미지 다운로드 실패');
      }

      const blob = await response.blob();
      const mimeType = blob.type || 'image/png';

      // Blob을 File로 변환
      const file = new File([blob], fileName, { type: mimeType });

      // base64로 변환
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      // 레퍼런스 파일로 업로드
      const uploadResponse = await fetch('/api/reference-files/upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          imageData: dataUrl,
          mimeType,
          fileName: fileName,
          webtoonId,
          processId,
          description: '자유창작에서 추가',
          userId: profile.id,
        }),
      });

      if (!uploadResponse.ok) {
        const error = await uploadResponse.json().catch(() => ({}));
        throw new Error(error.error || '레퍼런스 파일 업로드 실패');
      }

      const { file: uploadedFile } = await uploadResponse.json();
      
      // 레퍼런스 파일을 ReferenceFile 타입으로 변환
      const referenceFile: ReferenceFile = {
        id: uploadedFile.id,
        webtoon_id: webtoonId,
        process_id: processId,
        file_name: uploadedFile.file_name,
        file_path: uploadedFile.file_path,
        storage_path: uploadedFile.storage_path,
        thumbnail_path: null,
        file_size: uploadedFile.file_size,
        file_type: uploadedFile.file_type,
        mime_type: uploadedFile.mime_type,
        description: '자유창작에서 추가',
        metadata: {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      // 최근 레퍼런스에 추가
      handleReferenceUpload(referenceFile);
      
      // 자동으로 선택도 추가
      handleReferenceSelect(referenceFile);

      console.log('[자유창작] 레퍼런스 추가 성공:', referenceFile.id);
    } catch (error) {
      console.error('[자유창작] 레퍼런스 추가 실패:', error);
      alert(error instanceof Error ? error.message : '레퍼런스 추가에 실패했습니다.');
    }
  }, [actualReadOnly, profile?.id, processes, webtoonId, handleReferenceUpload, handleReferenceSelect]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex h-full overflow-hidden flex-col">
      {/* 읽기 전용 배너 */}
      {actualReadOnly && (
        <div className="flex-shrink-0 bg-muted border-b px-4 py-2 flex items-center justify-center">
          <p className="text-sm text-muted-foreground">
            읽기 전용 모드 - 다른 사용자의 세션을 보고 있습니다
          </p>
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">
        {/* 좌측 사이드바 */}
        <FreeCreationSidebar
          recentReferences={recentReferences}
          selectedReferenceIds={selectedReferenceIds}
          onReferenceSelect={handleReferenceSelect}
          onReferenceDeselect={handleReferenceDeselect}
          onReferenceDelete={actualReadOnly ? undefined : handleReferenceDelete}
          onCharacterSheetsSelected={actualReadOnly ? undefined : handleCharacterSheetsSelected}
          webtoonId={webtoonId}
          processes={processes}
          onReferenceUpload={actualReadOnly ? undefined : handleReferenceUpload}
          readOnly={actualReadOnly}
        />

        {/* 우측 메인 영역 */}
        <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
          {/* 채팅 히스토리 */}
          <FreeCreationChatHistory
            messages={messages}
            onImageClick={handleImageClick}
            onMessageClick={actualReadOnly ? undefined : handleMessageClick}
            onRetry={actualReadOnly ? undefined : handleRetry}
            onAddAsReference={actualReadOnly ? undefined : handleAddAsReference}
          />

          {/* 프롬프트 입력 - 읽기 전용이면 숨김 */}
          {!actualReadOnly && (
            <FreeCreationPromptInput
              selectedReferences={selectedReferences}
              onReferenceRemove={handleReferenceDeselect}
              onReferenceAdd={handleReferenceAdd}
              onSubmit={handleSubmit}
              onClear={() => {
                setSelectedReferences([]);
                setSelectedReferenceIds(new Set());
                setInitialPrompt(undefined);
                setInitialAspectRatio(undefined);
              }}
              isGenerating={isGenerating}
              apiProvider={globalModel}
              onDrop={handleFileDrop}
              initialPrompt={initialPrompt}
              initialAspectRatio={initialAspectRatio}
            />
          )}
        </div>
      </div>

      {/* 이미지 뷰어 */}
      {viewerImage && (
        <ImageViewer
          imageUrl={viewerImage.url}
          imageName={viewerImage.name}
          open={viewerOpen}
          onOpenChange={(open) => {
            setViewerOpen(open);
            if (!open) setViewerImage(null);
          }}
        />
      )}
    </div>
  );
}
