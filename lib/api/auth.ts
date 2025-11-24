import { supabase } from '../supabase';

// Supabase 환경 변수 가져오기
const getSupabaseUrl = () => {
  if (typeof window !== 'undefined') {
    return window.location.origin.includes('localhost') 
      ? process.env.NEXT_PUBLIC_SUPABASE_URL || ''
      : process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  }
  return process.env.NEXT_PUBLIC_SUPABASE_URL || '';
};

const getSupabaseAnonKey = () => {
  return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
};

export interface UserProfile {
  id: string;
  email: string;
  role: 'admin' | 'manager' | 'staff' | 'viewer';
  name?: string;
  created_at: string;
  updated_at: string;
}

export interface Invitation {
  id: string;
  email: string;
  role: 'admin' | 'manager' | 'staff' | 'viewer';
  token: string;
  invited_by?: string;
  expires_at: string;
  used_at?: string;
  created_at: string;
}

// 로그인
export async function signIn(email: string, password: string) {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    // 이메일 미확인 오류인 경우 자동으로 확인 처리
    if (error && (error.message?.includes('Email not confirmed') || error.message?.includes('email_not_confirmed'))) {
      console.log('이메일 미확인, 자동 확인 처리...');
      try {
        // 이메일로 직접 확인 처리 (에러 무시)
        const { error: confirmError } = await supabase.rpc('confirm_user_email_by_email', { 
          user_email: email 
        });
        if (confirmError) {
          console.warn('이메일 확인 RPC 실패, 직접 SQL 시도:', confirmError);
        }
        
        // 잠시 대기 후 다시 로그인 시도
        await new Promise((resolve) => setTimeout(resolve, 500));
        const { data: retryData, error: retryError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        
        if (retryError) {
          // 여전히 실패하면 원래 에러를 던지되, 사용자에게는 더 친절한 메시지
          if (retryError.message?.includes('Email not confirmed')) {
            throw new Error('이메일 확인이 필요합니다. 관리자에게 문의해주세요.');
          }
          throw retryError;
        }
        
        if (retryData.user) {
          const profile = await getUserProfile(retryData.user.id);
          return { user: retryData.user, profile };
        }
      } catch (confirmError: any) {
        console.warn('이메일 확인 처리 실패:', confirmError);
        // 확인 실패해도 원래 에러를 던짐
        throw error;
      }
    }

    if (error) throw error;

    // 사용자 프로필 가져오기
    if (data.user) {
      let profile = await getUserProfile(data.user.id);
      
      // 프로필이 없으면 생성 대기
      if (!profile) {
        let retries = 10;
        while (retries > 0 && !profile) {
          await new Promise((resolve) => setTimeout(resolve, 500));
          profile = await getUserProfile(data.user.id);
          retries--;
        }
      }
      
      // 프로필이 있지만 역할이 viewer이고, 사용된 초대가 있으면 역할 업데이트
      if (profile && profile.role === 'viewer') {
        const { data: usedInvitation } = await supabase
          .from('invitations')
          .select('role')
          .eq('email', email)
          .not('used_at', 'is', null)
          .order('used_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        
        if (usedInvitation && usedInvitation.role !== 'viewer') {
          console.log('초대된 역할로 업데이트:', usedInvitation.role);
          try {
            const { error: roleError } = await supabase.rpc('update_user_role_on_signup', {
              user_id: data.user.id,
              new_role: usedInvitation.role,
            });
            if (!roleError) {
              // 업데이트된 프로필 다시 가져오기
              profile = await getUserProfile(data.user.id);
            }
          } catch (err: any) {
            console.warn('역할 업데이트 실패:', err);
          }
        }
      }
      
      return { user: data.user, profile };
    }

    return { user: data.user, profile: null };
  } catch (error: any) {
    console.error('로그인 오류:', error);
    throw error;
  }
}

// 회원가입 (초대 토큰 필요, 단 첫 사용자는 자동으로 관리자)
export async function signUp(email: string, password: string, token?: string, name?: string) {
  try {
    let role: 'admin' | 'manager' | 'staff' | 'viewer' = 'viewer';
    let invitationId: string | null = null;

    // 초대 토큰이 있는 경우 검증
    if (token) {
      const invitation = await verifyInvitationToken(token);
      if (!invitation) {
        throw new Error('유효하지 않은 초대 토큰입니다.');
      }

      if (invitation.email !== email) {
        throw new Error('초대된 이메일과 일치하지 않습니다.');
      }

      if (invitation.used_at) {
        throw new Error('이미 사용된 초대 토큰입니다.');
      }

      if (new Date(invitation.expires_at) < new Date()) {
        throw new Error('만료된 초대 토큰입니다.');
      }

      role = invitation.role;
      invitationId = invitation.id;
    }

    // 회원가입
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          name: name || split_part(email, '@', 1),
        },
      },
    });

    if (error) throw error;

    if (!data.user) {
      throw new Error('사용자 생성에 실패했습니다.');
    }

    // 이메일 확인 자동 처리 (초대받은 사용자는 이메일 확인 불필요)
    try {
      const { error: confirmError } = await supabase.rpc('confirm_user_email', { 
        user_id: data.user.id 
      });
      if (confirmError) {
        console.warn('이메일 확인 자동 처리 실패 (무시 가능):', confirmError);
      } else {
        console.log('이메일 확인 완료');
      }
    } catch (confirmError: any) {
      console.warn('이메일 확인 자동 처리 실패 (무시 가능):', confirmError);
    }

    // 초대 토큰이 없는 경우, 첫 사용자인지 확인 (회원가입 후)
    if (!token) {
      const { data: isFirst, error: checkError } = await supabase.rpc('is_first_user_excluding', {
        user_id: data.user.id
      });
      
      if (checkError) {
        console.error('첫 사용자 확인 오류:', checkError);
        // 오류 발생 시 기본적으로 viewer로 설정 (안전)
        role = 'viewer';
      } else if (isFirst === true) {
        // 첫 사용자는 자동으로 관리자
        role = 'admin';
      } else {
        // 이미 다른 사용자가 있는 경우
        throw new Error('초대 토큰이 필요합니다.');
      }
    }

    // 프로필이 자동 생성될 때까지 대기 (트리거가 처리함, 최대 10초, 0.5초마다 확인)
    // 세션 없이도 프로필 생성 확인 가능 (트리거는 SECURITY DEFINER로 실행)
    let profile: UserProfile | null = null;
    let retries = 20; // 10초 대기
    
    // 프로필 생성 대기 (세션 없이도 확인 가능)
    while (retries > 0 && !profile) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      
      // 프로필이 생성되었는지 확인 (세션 없이도 가능하도록 직접 쿼리)
      try {
        // 임시로 세션을 만들어서 프로필 확인 (또는 RPC 함수 사용)
        const { data: profileData, error: profileError } = await supabase
          .from('user_profiles')
          .select('*')
          .eq('id', data.user.id)
          .maybeSingle();
        
        if (!profileError && profileData) {
          profile = profileData;
          break;
        }
      } catch (err: any) {
        // 에러 무시하고 계속 시도
      }
      retries--;
    }

    // 프로필 역할 업데이트 (RPC 함수로 세션 없이 처리)
    // handle_new_user() 트리거가 초대 정보를 확인하여 역할을 설정하지만,
    // 안전을 위해 명시적으로 역할 업데이트 시도
    if (profile) {
      try {
        // 현재 프로필의 역할이 초대된 역할과 다르면 업데이트
        if (profile.role !== role) {
          const { error: roleError } = await supabase.rpc('update_user_role_on_signup', {
            user_id: data.user.id,
            new_role: role,
          });
          if (roleError) {
            console.warn('역할 업데이트 실패:', roleError);
          } else {
            console.log('역할 업데이트 완료:', role);
            // 업데이트된 프로필 다시 가져오기
            const { data: updatedProfile } = await supabase
              .from('user_profiles')
              .select('*')
              .eq('id', data.user.id)
              .maybeSingle();
            if (updatedProfile) {
              profile = updatedProfile;
            }
          }
        } else {
          console.log('프로필 역할이 이미 올바르게 설정됨:', role);
        }
      } catch (roleError: any) {
        console.warn('역할 설정 실패:', roleError);
      }
    } else {
      // 프로필이 아직 생성되지 않은 경우, 역할 정보를 저장해두고 나중에 처리
      console.warn('프로필이 아직 생성되지 않았습니다. 역할은 로그인 후 설정됩니다.');
      // 역할 정보는 invitationId에 저장되어 있으므로 로그인 시 처리 가능
    }

    // 초대 토큰 사용 처리 (프로필 생성 및 역할 업데이트 후)
    // 주의: handle_new_user() 트리거가 초대 정보를 확인하므로,
    // 초대 토큰을 사용 처리하기 전에 프로필이 생성되어야 함
    if (invitationId) {
      await markInvitationAsUsed(invitationId, data.user.id);
    }

    // 회원가입 성공, 세션은 만들지 않고 사용자 정보만 반환
    // 프로필은 로그인 후 가져오도록 함
    return { 
      user: data.user, 
      profile: profile || null // 프로필이 있으면 반환, 없으면 null
    };
  } catch (error: any) {
    console.error('회원가입 오류:', error);
    throw error;
  }
}

// 로그아웃
export async function signOut() {
  try {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  } catch (error: any) {
    console.error('로그아웃 오류:', error);
    throw error;
  }
}

// 현재 사용자 세션 가져오기
export async function getSession() {
  try {
    // 타임아웃 설정 (5초)
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('세션 조회 타임아웃')), 5000);
    });
    
    const sessionPromise = supabase.auth.getSession();
    const result = await Promise.race([
      sessionPromise,
      timeoutPromise
    ]).catch(() => ({ data: { session: null }, error: null }));
    
    const { data: { session }, error } = result as Awaited<ReturnType<typeof supabase.auth.getSession>>;
    
    if (error) throw error;
    return session;
  } catch (error: any) {
    console.error('세션 가져오기 오류:', error);
    // 타임아웃이나 네트워크 오류인 경우 null 반환하여 로딩이 멈추지 않도록 함
    if (error.message?.includes('타임아웃') || error.message?.includes('network')) {
      return null;
    }
    throw error;
  }
}

// 현재 사용자 프로필 가져오기
export async function getCurrentUserProfile(): Promise<UserProfile | null> {
  try {
    const session = await getSession();
    if (!session?.user) return null;

    // 세션을 전달하여 중복 조회 방지
    return await getUserProfile(session.user.id, session);
  } catch (error: any) {
    console.error('사용자 프로필 가져오기 오류:', error);
    return null;
  }
}

// 사용자 프로필 가져오기
// session 파라미터가 제공되면 세션 조회를 건너뛰어 중복 조회 방지
export async function getUserProfile(userId: string, session?: any): Promise<UserProfile | null> {
  try {
    // 세션이 제공되지 않은 경우에만 조회
    let currentSession = session;
    if (!currentSession) {
      // 타임아웃 설정 (5초)
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('프로필 조회 타임아웃')), 5000);
      });
      
      const sessionPromise = supabase.auth.getSession();
      const sessionResult = await Promise.race([
        sessionPromise,
        timeoutPromise
      ]).catch(() => ({ data: { session: null } }));
      
      const { data: { session: fetchedSession } } = sessionResult as Awaited<ReturnType<typeof supabase.auth.getSession>>;
      currentSession = fetchedSession;
    }
    
    if (!currentSession) {
      // 세션이 없으면 null 반환 (호출자가 처리)
      return null;
    }

    // 쿼리 실행 (세션이 제공된 경우 타임아웃 없이 빠르게 실행)
    const queryPromise = supabase
      .from('user_profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();
    
    // 세션이 제공된 경우 타임아웃 없이 실행, 제공되지 않은 경우에만 타임아웃 적용
    let queryResult: { data: UserProfile | null; error: { message: string; code?: string } | null };
    if (session) {
      // 세션이 이미 제공된 경우 빠르게 실행 (타임아웃 없음)
      const result = await queryPromise;
      queryResult = { data: result.data, error: result.error };
    } else {
      // 세션을 조회한 경우에만 타임아웃 적용
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('프로필 조회 타임아웃')), 5000);
      });
      queryResult = await Promise.race([
        queryPromise.then(result => ({ data: result.data, error: result.error })),
        timeoutPromise
      ]).catch(() => ({ data: null, error: { message: '타임아웃' } })) as { data: UserProfile | null; error: { message: string; code?: string } | null };
    }
    
    const { data, error } = queryResult;

    if (error) {
      // PGRST116 에러는 데이터가 없다는 의미이므로 null 반환
      if (error.code === 'PGRST116') {
        return null;
      }
      // RLS 에러인 경우 더 자세한 로그
      if (error.code === '42501') {
        console.error('RLS 정책 위반 - 프로필 조회 실패:', {
          userId,
          sessionUserId: currentSession?.user?.id,
          error: error.message,
        });
      }
      throw error;
    }
    return data;
  } catch (error: any) {
    // 타임아웃이나 네트워크 오류인 경우 null 반환
    if (error.message?.includes('타임아웃') || error.message?.includes('network')) {
      console.warn('프로필 조회 타임아웃 또는 네트워크 오류:', error);
      return null;
    }
    // PGRST116 에러는 데이터가 없다는 의미이므로 null 반환
    if (error.code === 'PGRST116') {
      return null;
    }
    console.error('프로필 조회 오류:', error);
    return null;
  }
}

// 사용자 역할 업데이트
export async function updateUserRole(userId: string, role: UserProfile['role']) {
  try {
    const { error } = await supabase
      .from('user_profiles')
      .update({ role })
      .eq('id', userId);

    if (error) throw error;
  } catch (error: any) {
    console.error('역할 업데이트 오류:', error);
    throw error;
  }
}

// 초대 토큰 검증
export async function verifyInvitationToken(token: string): Promise<Invitation | null> {
  try {
    const { data, error } = await supabase
      .from('invitations')
      .select('*')
      .eq('token', token)
      .single();

    if (error) throw error;
    return data;
  } catch (error: any) {
    console.error('초대 토큰 검증 오류:', error);
    return null;
  }
}

// 초대 토큰 사용 처리
export async function markInvitationAsUsed(invitationId: string, userId: string) {
  try {
    const { error } = await supabase
      .from('invitations')
      .update({ used_at: new Date().toISOString() })
      .eq('id', invitationId);

    if (error) throw error;
  } catch (error: any) {
    console.error('초대 토큰 사용 처리 오류:', error);
    throw error;
  }
}

// 초대 생성 (관리자 전용)
export async function createInvitation(
  email: string,
  role: UserProfile['role'],
  invitedBy: string
): Promise<Invitation> {
  try {
    // 세션 확인
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session) {
      console.error('세션 오류:', sessionError);
      throw new Error('인증 세션이 없습니다. 다시 로그인해주세요.');
    }

    console.log('초대 생성 요청:', { email, role, invitedBy, sessionUserId: session.user.id });

    const { data, error } = await supabase
      .from('invitations')
      .insert({
        email,
        role,
        invited_by: invitedBy,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7일 후 만료
      })
      .select()
      .single();

    if (error) {
      console.error('Supabase 초대 생성 오류:', error);
      console.error('에러 코드:', error.code);
      console.error('에러 메시지:', error.message);
      console.error('에러 상세:', error.details);
      throw new Error(error.message || `초대 생성에 실패했습니다. (${error.code || 'unknown'})`);
    }

    if (!data) {
      throw new Error('초대 생성에 실패했습니다. 데이터가 반환되지 않았습니다.');
    }

    console.log('초대 생성 성공:', data);

    // 이메일 자동 전송 (비동기, 실패해도 초대는 성공으로 처리)
    try {
      const invitationLink = `${window.location.origin}/signup?token=${data.token}`;
      
      // 초대한 사람의 이름 가져오기
      let inviterName: string | undefined;
      try {
        const inviterProfile = await getUserProfile(invitedBy);
        inviterName = inviterProfile?.name || undefined;
      } catch (err) {
        console.warn('초대자 정보 조회 실패:', err);
      }

      // Edge Function 호출
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const functionUrl = `${getSupabaseUrl()}/functions/v1/send-invitation-email`;
        const anonKey = getSupabaseAnonKey();
        
        const response = await fetch(functionUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
            'apikey': anonKey,
          },
          body: JSON.stringify({
            email,
            role,
            token: data.token,
            invitationLink,
            inviterName,
          }),
        });

        if (response.ok) {
          const result = await response.json();
          console.log('이메일 전송 성공:', result);
        } else {
          const errorText = await response.text();
          let errorData;
          try {
            errorData = JSON.parse(errorText);
          } catch {
            errorData = errorText;
          }
          console.error('이메일 전송 실패 (초대는 성공):', {
            status: response.status,
            statusText: response.statusText,
            error: errorData,
          });
          // 이메일 전송 실패해도 초대는 성공으로 처리
        }
      }
    } catch (emailError: any) {
      console.error('이메일 전송 중 오류 발생 (초대는 성공):', {
        message: emailError.message,
        stack: emailError.stack,
        error: emailError,
      });
      // 이메일 전송 실패해도 초대는 성공으로 처리
    }

    return data;
  } catch (error: any) {
    console.error('초대 생성 오류:', error);
    throw error;
  }
}

// 초대 목록 조회 (관리자 전용)
export async function getInvitations(): Promise<Invitation[]> {
  try {
    const { data, error } = await supabase
      .from('invitations')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (error: any) {
    console.error('초대 목록 조회 오류:', error);
    return [];
  }
}

// 유저 목록 조회 (관리자 전용)
export async function getUsers(): Promise<UserProfile[]> {
  try {
    const { data, error } = await supabase
      .from('user_profiles')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (error: any) {
    console.error('유저 목록 조회 오류:', error);
    throw error;
  }
}

// 유틸리티 함수
function split_part(str: string, delimiter: string, part: number): string {
  const parts = str.split(delimiter);
  return parts[part - 1] || '';
}

