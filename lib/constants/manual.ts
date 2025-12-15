import {
  BookOpen,
  FolderTree,
  FileText,
  FolderOpen,
  Search,
  Sparkles,
  Image as ImageIcon,
  Wand2,
  Users,
  UserCircle,
  Box,
  Settings,
} from 'lucide-react';

export interface ManualGroup {
  id: string;
  title: string;
  description: string;
  icon: typeof BookOpen;
}

export interface ManualFeature {
  id: string;
  name: string;
  description: string;
  groupId: string;
  details: string[];
  icon: typeof BookOpen;
  images?: string[]; // 이미지 경로 배열 (public/manual/ 폴더 기준)
}

export const manualGroups: ManualGroup[] = [
  {
    id: 'content-management',
    title: '콘텐츠 관리',
    description: '웹툰, 회차, 컷 및 공정을 관리합니다',
    icon: BookOpen,
  },
  {
    id: 'file-management',
    title: '파일 관리',
    description: '파일 업로드, 다운로드, 검색 및 레퍼런스 파일을 관리합니다',
    icon: FolderOpen,
  },
  {
    id: 'ai-features',
    title: 'AI 기능',
    description: 'AI를 활용한 이미지 분석, 재생성 및 생성 기능',
    icon: Sparkles,
  },
  {
    id: 'character',
    title: '캐릭터 관련',
    description: '캐릭터 관리 및 자세 생성 기능',
    icon: UserCircle,
  },
  {
    id: 'system',
    title: '시스템 관리',
    description: '사용자 관리 및 권한 설정',
    icon: Settings,
  },
];

export const manualFeatures: ManualFeature[] = [
  // 콘텐츠 관리
  {
    id: 'webtoon-management',
    name: '웹툰 관리',
    description: '웹툰, 회차, 컷을 생성하고 관리합니다',
    groupId: 'content-management',
    details: [
      '웹툰 생성, 수정, 삭제',
      '회차 생성, 수정, 삭제',
      '컷 생성, 수정, 삭제',
      '계층적 구조 관리 (웹툰 → 회차 → 컷)',
    ],
    icon: BookOpen,
    images: ['webtoon-management-1.png', 'webtoon-management-2.png'],
  },
  {
    id: 'process-management',
    name: '공정별 관리',
    description: '공정별로 파일을 그룹화하여 관리합니다',
    groupId: 'content-management',
    details: [
      '공정 생성, 수정, 삭제',
      '공정별 파일 그룹화',
      '공정 순서 변경',
      '공정별 색상 설정',
    ],
    icon: FolderTree,
    images: ['process-management-1.png'],
  },
  // 파일 관리
  {
    id: 'file-management',
    name: '파일 관리',
    description: '파일을 업로드, 다운로드, 수정하고 검색합니다',
    groupId: 'file-management',
    details: [
      '드래그 앤 드롭 업로드',
      '클립보드 붙여넣기 업로드 (Ctrl+V / Cmd+V)',
      '파일 선택 다이얼로그 업로드',
      '파일 다운로드',
      '파일 삭제',
      '파일 정보 수정',
    ],
    icon: FileText,
    images: ['file-management-1.png', 'file-management-2.png'],
  },
  {
    id: 'reference-files',
    name: '레퍼런스 파일 관리',
    description: '레퍼런스 파일을 업로드하고 공정별로 관리합니다',
    groupId: 'file-management',
    details: [
      '레퍼런스 파일 업로드',
      '공정별 레퍼런스 파일 필터링',
      '레퍼런스 파일 다운로드 및 삭제',
      '레퍼런스 파일 설명 수정',
    ],
    icon: FolderOpen,
    images: ['reference-files-1.png'],
  },
  {
    id: 'search',
    name: '검색 기능',
    description: '파일명, 설명, 메타데이터를 기반으로 파일을 검색합니다',
    groupId: 'file-management',
    details: [
      '파일명 검색',
      '파일 설명 검색',
      '메타데이터 검색 (장면 요약, 태그)',
      '검색 결과에서 파일 상세 정보 확인',
    ],
    icon: Search,
    images: ['search-1.png'],
  },
  // AI 기능
  {
    id: 'ai-image-analysis',
    name: 'AI 이미지 분석',
    description: 'AI를 활용하여 이미지의 메타데이터를 자동으로 생성합니다',
    groupId: 'ai-features',
    details: [
      '이미지 업로드 시 자동 분석',
      '수동 분석/재분석 기능',
      '장면 요약 자동 생성',
      '태그 자동 추출',
      '등장인물 수 자동 추출',
    ],
    icon: ImageIcon,
    images: ['ai-image-analysis-1.png', 'ai-image-analysis-2.png'],
  },
  {
    id: 'ai-image-regeneration',
    name: 'AI 이미지 재생성',
    description: '다양한 스타일로 이미지를 재생성합니다',
    groupId: 'ai-features',
    details: [
      '다양한 스타일 선택 (괴수디테일, 채색 빼기, 배경 지우기 등)',
      '배치 재생성 (여러 이미지 동시 생성)',
      '레퍼런스 이미지 활용 (톤먹 넣기)',
      '프롬프트 편집',
      '재생성된 이미지 선택 및 저장',
    ],
    icon: Wand2,
    images: ['ai-image-regeneration-1.png', 'ai-image-regeneration-2.png'],
  },
  {
    id: 'monster-generator',
    name: '몬스터 생성기',
    description: 'AI를 활용하여 프롬프트 기반 몬스터 이미지를 생성합니다',
    groupId: 'ai-features',
    details: [
      '프롬프트 기반 몬스터 이미지 생성',
      'AI 프롬프트 자동 생성',
      '비율 선택 (가로/정사각/세로)',
      '생성된 이미지 선택 및 저장',
      '생성 히스토리 관리',
    ],
    icon: Sparkles,
    images: ['monster-generator-1.png'],
  },
  // 캐릭터 관련
  {
    id: 'character-management',
    name: '캐릭터 관리',
    description: '캐릭터를 생성하고 캐릭터 시트를 관리합니다',
    groupId: 'character',
    details: [
      '캐릭터 생성, 수정, 삭제',
      '캐릭터 시트 업로드',
      'AI 캐릭터 시트 자동 생성 (4방향)',
      '웹툰별 캐릭터 관리',
    ],
    icon: Users,
    images: ['character-management-1.png', 'character-management-2.png'],
  },
  {
    id: 'character-pose',
    name: '캐릭터 자세 만들기 (3D 뷰어)',
    description: '3D 뷰어를 활용하여 캐릭터 자세를 만들고 AI 이미지를 생성합니다',
    groupId: 'character',
    details: [
      '3D 모델 뷰어 (GLB 파일)',
      '이미지를 GLB로 변환',
      '3D 뷰어에서 자세 조정',
      '캐릭터 시트와 3D 자세 결합',
      '비율 선택 (가로/정사각/세로)',
      '추가 프롬프트 입력',
      'AI 이미지 생성 및 저장',
    ],
    icon: Box,
    images: ['character-pose-1.png', 'character-pose-2.png'],
  },
  // 시스템 관리
  {
    id: 'admin-features',
    name: '관리자 기능',
    description: '사용자 관리, 초대 및 권한을 관리합니다',
    groupId: 'system',
    details: [
      '사용자 목록 조회',
      '사용자 권한 변경',
      '사용자 초대 (이메일 발송)',
      '초대 링크 관리',
      '역할 기반 권한 관리 (admin, manager, staff, viewer)',
    ],
    icon: Settings,
    images: ['admin-features-1.png'],
  },
];

// 그룹별로 기능을 분류하는 헬퍼 함수
export function getFeaturesByGroup(groupId: string): ManualFeature[] {
  return manualFeatures.filter((feature) => feature.groupId === groupId);
}

// ID로 기능을 찾는 헬퍼 함수
export function getFeatureById(featureId: string): ManualFeature | undefined {
  return manualFeatures.find((feature) => feature.id === featureId);
}

// ID로 그룹을 찾는 헬퍼 함수
export function getGroupById(groupId: string): ManualGroup | undefined {
  return manualGroups.find((group) => group.id === groupId);
}

