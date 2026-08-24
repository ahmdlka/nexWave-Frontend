'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Box, CircularProgress } from '@mui/material';
import { supabase } from '@/lib/supabase';

export default function HomePage() {
  const router = useRouter();
  const [resolvingRole, setResolvingRole] = useState(true);

  useEffect(() => {
    async function routeUser() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.replace('/login');
        return;
      }

      const { data: profile } = await supabase
        .from('users')
        .select('role')
        .eq('id', session.user.id)
        .maybeSingle();

      if (profile?.role === 'manager') {
        router.replace('/manager');
        return;
      }
      if (profile?.role === 'operator') {
        router.replace('/operator');
        return;
      }

      setResolvingRole(false);
    }

    void routeUser();
  }, [router]);

  if (!resolvingRole) return null;
  return <Box sx={{ display: 'flex', height: '100dvh', alignItems: 'center', justifyContent: 'center', bgcolor: '#0a1a4b' }}><CircularProgress sx={{ color: 'white' }} /></Box>;
}
