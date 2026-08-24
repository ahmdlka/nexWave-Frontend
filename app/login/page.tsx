'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import {
  Box,
  Button,
  Container,
  Divider,
  Paper,
  TextField,
  Typography,
  Alert,
  CircularProgress,
} from '@mui/material';
import GoogleIcon from '@mui/icons-material/Google';
import Image from 'next/image';
import { supabase } from '@/lib/supabase';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      router.replace('/');
    }
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError(null);
    
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
    }
  };

  return (
    <Box
      sx={{
        height: '100dvh',
        width: '100%',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #0a1a4b 0%, #002b74 100%)',
      }}
    >
      <Box sx={{ mb: 4}}>
        <Image
          src="/logo-nexwave.svg"
          alt="nexWAVE"
          width={200}
          height={50}
          priority
        />
      </Box>
      <Container maxWidth="sm">
        <Paper
          elevation={4}
          sx={{
            p: { xs: 4, md: 6, mb: 4 },
            borderRadius: 3,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
          }}
        >

          <Typography variant="h5" sx={{ fontWeight: 700, mb: 1, color: '#202938' }}>
            Selamat Datang
          </Typography>
          <Typography variant="body2" sx={{ color: '#687386', mb: 4 }}>
            Masuk ke Operations Control Center
          </Typography>

          {error && (
            <Alert severity="error" sx={{ width: '100%', mb: 3 }}>
              {error}
            </Alert>
          )}

          <Button
            fullWidth
            variant="outlined"
            startIcon={<GoogleIcon />}
            onClick={handleGoogleLogin}
            disabled={loading}
            sx={{
              py: 1.5,
              textTransform: 'none',
              fontWeight: 600,
              color: '#202938',
              borderColor: '#cbd5e1',
              '&:hover': {
                borderColor: '#0056d6',
                bgcolor: '#f8fafc',
              },
            }}
          >
            Masuk sebagai Manager (Google)
          </Button>

          <Divider sx={{ width: '100%', my: 3 }}>
            <Typography variant="caption" sx={{ color: '#94a3b8', fontWeight: 600 }}>
              ATAU SEBAGAI OPERATOR
            </Typography>
          </Divider>

          <Box component="form" onSubmit={handleEmailLogin} sx={{ width: '100%' }}>
            <TextField
              fullWidth
              label="Email"
              variant="outlined"
              margin="normal"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
              required
            />
            <TextField
              fullWidth
              label="Password"
              type="password"
              variant="outlined"
              margin="normal"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              required
            />
            <Button
              fullWidth
              type="submit"
              variant="contained"
              disabled={loading}
              sx={{
                mt: 3,
                py: 1.5,
                bgcolor: '#0056d6',
                fontWeight: 700,
                '&:hover': {
                  bgcolor: '#0044ab',
                },
              }}
            >
              {loading ? <CircularProgress size={24} color="inherit" /> : 'Masuk'}
            </Button>
          </Box>
        </Paper>
      </Container>
    </Box>
  );
}
