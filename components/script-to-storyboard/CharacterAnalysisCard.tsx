'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, User, Users, Sparkles, Plus } from 'lucide-react';
import type { Script, CharacterAnalysisData } from './types';

export interface CharacterAnalysisCardProps {
  script: Script;
  characterAnalysis?: CharacterAnalysisData;
  selectedCharacterSheet: Record<string, number>;
  analyzingId: string | null;
  generatingCharacterImage: string | null;
  loadingWebtoonCharacters: boolean;
  webtoonCharactersCount: number;
  onAnalyzeCharacters: (script: Script) => void;
  onManualSelectOpen: () => void;
  onGenerateCharacterImage: (
    scriptId: string,
    characterIndex: number,
    characterName: string,
    characterDescription: string
  ) => void;
  onCreateCharacterFromAnalysis: (
    scriptId: string,
    characterName: string,
    characterDescription: string,
    webtoonId: string
  ) => void;
  onSelectCharacterSheet: (key: string, sheetIndex: number) => void;
}

export function CharacterAnalysisCard({
  script,
  characterAnalysis,
  selectedCharacterSheet,
  analyzingId,
  generatingCharacterImage,
  loadingWebtoonCharacters,
  webtoonCharactersCount,
  onAnalyzeCharacters,
  onManualSelectOpen,
  onGenerateCharacterImage,
  onCreateCharacterFromAnalysis,
  onSelectCharacterSheet,
}: CharacterAnalysisCardProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            등장인물
            {characterAnalysis && characterAnalysis.characters.length > 0 && (
              <span className="text-sm font-normal text-muted-foreground">
                ({characterAnalysis.characters.length}명)
              </span>
            )}
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={onManualSelectOpen}
              disabled={loadingWebtoonCharacters || webtoonCharactersCount === 0}
            >
              <Users className="mr-2 h-4 w-4" />
              수동입력
            </Button>
            <Button
              size="sm"
              onClick={() => onAnalyzeCharacters(script)}
              disabled={analyzingId === script.id}
            >
              {analyzingId === script.id ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  분석 중...
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  캐릭터 분석
                </>
              )}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {characterAnalysis && characterAnalysis.characters.length > 0 ? (
          <div className="space-y-3">
            {characterAnalysis.characters.map((char, charIdx) => (
              <Card key={charIdx} className="p-3">
                <div className="space-y-3">
                  <div>
                    <h5 className="font-semibold text-sm">{char.name}</h5>
                    {char.description && (
                      <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">
                        {char.description}
                      </p>
                    )}
                  </div>

                  {char.existsInDb && char.characterSheets.length > 0 ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <p className="text-xs text-muted-foreground">
                          캐릭터시트 {char.characterSheets.length}개
                        </p>
                      </div>
                      <div className="flex gap-2 overflow-x-auto py-2 px-1">
                        {char.characterSheets.map((sheet, sheetIdx) => {
                          const key = `${script.id}:${char.name}`;
                          const isSelected = (selectedCharacterSheet[key] ?? 0) === sheetIdx;
                          return (
                            <div
                              key={sheetIdx}
                              className={`flex-shrink-0 cursor-pointer transition-all ${
                                isSelected ? 'ring-2 ring-primary' : 'ring-1 ring-muted'
                              } rounded-md overflow-hidden`}
                              onClick={() => onSelectCharacterSheet(key, sheetIdx)}
                            >
                              <img
                                src={sheet.file_path}
                                alt={`${char.name} 캐릭터시트 ${sheetIdx + 1}`}
                                className="w-20 h-20 object-cover"
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-16 rounded bg-muted flex items-center justify-center flex-shrink-0">
                        <User className="h-8 w-8 text-muted-foreground/40" />
                      </div>
                      <p className="text-xs text-muted-foreground">캐릭터시트가 없습니다</p>
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs h-7"
                      onClick={() =>
                        onGenerateCharacterImage(
                          script.id,
                          charIdx,
                          char.name,
                          char.description
                        )
                      }
                      disabled={generatingCharacterImage === `${script.id}:${charIdx}`}
                    >
                      {generatingCharacterImage === `${script.id}:${charIdx}` ? (
                        <>
                          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                          생성 중...
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-3 w-3 mr-1" />
                          캐릭터시트 생성
                        </>
                      )}
                    </Button>
                    {!char.existsInDb && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs h-7"
                        onClick={() =>
                          onCreateCharacterFromAnalysis(
                            script.id,
                            char.name,
                            char.description,
                            characterAnalysis.webtoonId
                          )
                        }
                      >
                        <Plus className="h-3 w-3 mr-1" />
                        캐릭터 생성
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">대본에 등장하는 캐릭터들을 자동 분석합니다</p>
        )}
      </CardContent>
    </Card>
  );
}
