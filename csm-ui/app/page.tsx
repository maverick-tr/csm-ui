"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import TTSInterface from "@/components/tts-interface";
import GithubCorner from "@/components/github-corner";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-between p-4 md:p-8">
      <GithubCorner url="https://github.com/SesameAILabs/CSM" />
      <div className="w-full max-w-7xl mx-auto space-y-8">
        <Card className="border-none shadow-none bg-transparent">
          <CardHeader className="px-0 flex justify-center">
            <div className="flex items-center space-x-3">
              <div className="relative w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
              </div>
              <CardTitle className="text-2xl md:text-3xl font-mono">
                CSM UI
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="px-0">
            <TTSInterface />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
