import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const filename = formData.get('filename') as string;

    if (!file || !filename) {
      return NextResponse.json(
        { error: '파일과 파일명이 필요합니다.' },
        { status: 400 }
      );
    }

    // public/manual 디렉토리 확인 및 생성
    const manualDir = path.join(process.cwd(), 'public', 'manual');
    if (!fs.existsSync(manualDir)) {
      fs.mkdirSync(manualDir, { recursive: true });
    }

    // 파일 저장
    const filePath = path.join(manualDir, filename);
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    
    fs.writeFileSync(filePath, buffer);

    return NextResponse.json({
      success: true,
      message: '이미지가 업로드되었습니다.',
      path: `/manual/${filename}`,
    });
  } catch (error) {
    console.error('이미지 업로드 오류:', error);
    return NextResponse.json(
      { error: '이미지 업로드에 실패했습니다.' },
      { status: 500 }
    );
  }
}

