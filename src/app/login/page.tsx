/* eslint-disable @next/next/no-img-element */
"use client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
export default function Page() {
  const loginWithLark = () => {
    const redirectUri = encodeURIComponent(
      `${window.location.origin}/callback`,
    );
    const url = `https://passport.larksuite.com/suite/passport/oauth/authorize?client_id=${process.env.NEXT_PUBLIC_APP_ID}&redirect_uri=${redirectUri}`;

    window.location.href = url;
  };

  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <div className={cn("flex flex-col gap-6")}>
          <Card>
            <CardHeader>
              <CardTitle>เข้าสู่ระบบ</CardTitle>
              <CardDescription>
                กรุณาเข้าสู่ระบบก่อนดำเนินการต่อ
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-6">
                <div className="flex flex-col gap-3">
                  <Button
                    onClick={loginWithLark}
                    className="w-full cursor-pointer"
                  >
                    เข้าสู่ระบบด้วย lark
                    <img
                      src="lark-icon.png"
                      alt="lark_icon"
                      className="w-[24px]"
                    />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
