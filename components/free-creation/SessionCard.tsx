'use client';

import { useRouter } from 'next/navigation';
import { FreeCreationSessionWithStats } from '@/lib/supabase';
import { ImageIcon, MoreVertical, Trash2, Edit2 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { formatDistanceToNow } from 'date-fns';
import { ko } from 'date-fns/locale';
import Image from 'next/image';

interface SessionCardProps {
  session: FreeCreationSessionWithStats;
  isOwner: boolean;
  onEdit?: (sessionId: string, currentTitle: string) => void;
  onDelete?: (sessionId: string) => void;
}

export function SessionCard({ session, isOwner, onEdit, onDelete }: SessionCardProps) {
  const router = useRouter();

  const handleClick = () => {
    router.push(`/free-creation/${session.id}?webtoonId=${session.webtoon_id}`);
  };

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onEdit) {
      onEdit(session.id, session.title);
    }
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onDelete && confirm('이 세션을 삭제하시겠습니까?')) {
      onDelete(session.id);
    }
  };

  const thumbnails = session.latest_thumbnails || [];
  const messageCount = session.message_count || 0;
  const ownerName = session.owner_name || '알 수 없음';

  return (
    <div
      className={`
        group cursor-pointer rounded-xl overflow-hidden
        bg-card border transition-all duration-200 ease-out
        hover:scale-[1.02] hover:shadow-xl
        border-border/50 hover:border-border
      `}
      style={{ aspectRatio: '4/5' }}
      onClick={handleClick}
    >
      {/* 상단 영역 (70%) - 썸네일 */}
      <div className="relative h-[70%] bg-muted/50 overflow-hidden">
        {thumbnails.length > 0 ? (
          <div className="w-full h-full flex gap-1 p-1">
            {thumbnails.slice(0, 3).map((thumb, idx) => (
              <div key={idx} className="flex-1 relative overflow-hidden rounded">
                <Image
                  src={thumb}
                  alt={`${session.title} 썸네일 ${idx + 1}`}
                  fill
                  className="object-cover"
                  sizes="(max-width: 768px) 33vw, 10vw"
                />
              </div>
            ))}
          </div>
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-muted/80 to-muted">
            <ImageIcon className="h-12 w-12 text-muted-foreground/40" />
          </div>
        )}

        {/* 케밥 메뉴 (우상단) - 소유자만 */}
        {isOwner && (onEdit || onDelete) && (
          <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="p-1.5 rounded-full bg-background/80 backdrop-blur-sm border border-border/50 hover:bg-background transition-colors"
                  onClick={(e) => e.stopPropagation()}
                >
                  <MoreVertical className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {onEdit && (
                  <DropdownMenuItem onClick={handleEdit}>
                    <Edit2 className="h-4 w-4 mr-2" />
                    이름 변경
                  </DropdownMenuItem>
                )}
                {onDelete && (
                  <DropdownMenuItem onClick={handleDelete} className="text-destructive">
                    <Trash2 className="h-4 w-4 mr-2" />
                    삭제
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>

      {/* 하단 영역 (30%) - 정보 */}
      <div className="h-[30%] p-3 flex flex-col justify-between">
        <div>
          <h3 className="font-semibold text-sm line-clamp-2 mb-1">{session.title}</h3>
          <p className="text-xs text-muted-foreground">
            작성자: {ownerName}
          </p>
        </div>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>이미지: {messageCount}개</span>
          <span>
            {formatDistanceToNow(new Date(session.updated_at), {
              addSuffix: true,
              locale: ko,
            })}
          </span>
        </div>
      </div>
    </div>
  );
}
