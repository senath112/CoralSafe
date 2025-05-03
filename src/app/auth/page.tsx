
'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, UserCredential } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { Fish } from 'lucide-react';

export default function AuthPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  const handleAuth = async (event: FormEvent<HTMLFormElement>, action: 'login' | 'signup') => {
    event.preventDefault();
    setIsSubmitting(true);

    try {
      let userCredential: UserCredential;
      if (action === 'login') {
        userCredential = await signInWithEmailAndPassword(auth, email, password);
        toast({ title: 'Login Successful', description: `Welcome back, ${userCredential.user.email}!` });
      } else {
        userCredential = await createUserWithEmailAndPassword(auth, email, password);
        toast({ title: 'Signup Successful', description: `Welcome, ${userCredential.user.email}!` });
      }
      router.push('/'); // Redirect to home page after successful login/signup
    } catch (error: any) {
      console.error(`${action} failed:`, error);
      toast({
        title: `${action === 'login' ? 'Login' : 'Signup'} Failed`,
        description: error.message || 'An unexpected error occurred.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-b from-blue-300 via-blue-400 to-teal-500 p-4">
      <Card className="w-full max-w-md bg-white/90 dark:bg-slate-900/90 shadow-xl rounded-xl backdrop-blur-md border border-white/30">
         <CardHeader className="text-center">
           <div className="flex items-center justify-center mb-2">
             <Fish className="w-10 h-10 mr-3 text-cyan-500 animate-pulse" />
             <CardTitle className="text-3xl font-bold text-foreground">CoralGuard</CardTitle>
           </div>
           <CardDescription className="text-muted-foreground">
             Access your coral health analysis dashboard.
           </CardDescription>
         </CardHeader>
        <CardContent>
          <Tabs defaultValue="login" className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-6">
              <TabsTrigger value="login">Login</TabsTrigger>
              <TabsTrigger value="signup">Sign Up</TabsTrigger>
            </TabsList>
            <TabsContent value="login">
              <form onSubmit={(e) => handleAuth(e, 'login')} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="login-email">Email</Label>
                  <Input
                    id="login-email"
                    type="email"
                    placeholder="m@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="login-password">Password</Label>
                  <Input
                    id="login-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                     className="bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700"
                  />
                </div>
                <Button type="submit" className="w-full bg-cyan-500 hover:bg-cyan-600 text-white" disabled={isSubmitting}>
                  {isSubmitting ? 'Logging In...' : 'Login'}
                </Button>
              </form>
            </TabsContent>
            <TabsContent value="signup">
              <form onSubmit={(e) => handleAuth(e, 'signup')} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="signup-email">Email</Label>
                  <Input
                    id="signup-email"
                    type="email"
                    placeholder="m@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                     className="bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-password">Password</Label>
                  <Input
                    id="signup-password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                     className="bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700"
                  />
                </div>
                <Button type="submit" className="w-full bg-cyan-500 hover:bg-cyan-600 text-white" disabled={isSubmitting}>
                  {isSubmitting ? 'Signing Up...' : 'Sign Up'}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
