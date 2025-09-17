/* eslint-disable react-hooks/exhaustive-deps */
"use client";
import { useHelperContext } from "@/components/providers/helper-provider";
import { isErrorResponse } from "@/types/request";
import React, { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { setItem } from "@/lib/storage";

export default function Page() {
  const { setFullLoading, backendClient } = useHelperContext()();
  const searchParams = useSearchParams();

  const getAccessToken = async (code: string) => {
    const response = await backendClient.getAccessToken(code);
    if (isErrorResponse(response)) {
      return;
    }
    setItem("user_info", JSON.stringify(response));
    window.location.href = "/";
  };

  useEffect(() => {
    setFullLoading(true);
    const code = searchParams.get("code") || "";
    if (code) {
      getAccessToken(code);
    } else {
      window.location.href = "/";
    }
  }, []);

  return <div></div>;
}
