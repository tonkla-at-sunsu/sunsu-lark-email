/* eslint-disable react-hooks/exhaustive-deps */
"use client";
import { AppSidebar } from "@/components/app-sidebar";
import { SiteHeader } from "@/components/site-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { DataTable } from "./DataTable";
import { ColumnDef } from "@tanstack/react-table";
import { useEffect, useState } from "react";
import { EmailDetail, isErrorResponse } from "@/types/request";
import { useHelperContext } from "@/components/providers/helper-provider";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  idbGetItem,
  idbSetItem,
  idbCountKeysByPrefix,
  idbGetValuesByPrefix,
} from "@/lib/storage";

export type EmailList = {
  id: string;
  subject: string;
  head_from_email: string;
  attachment_content: string;
  date: string;
  data: EmailDetail;
};

export const columns: ColumnDef<EmailList>[] = [
  {
    accessorKey: "subject",
    header: "หัวข้อ",
  },
  {
    accessorKey: "head_from_email",
    header: "ผู้ส่ง",
  },
  {
    accessorKey: "date",
    header: "วันที่ส่ง",
  },
  {
    accessorKey: "attachment_content",
    header: "ไฟล์",
    meta: { renderHtml: true },
  },
];

export default function Page() {
  const [emailDetails, setEmailDetails] = useState<EmailDetail[]>([]);
  const { backendClient, userInfo, setShowEmailDetail, setFullLoading } =
    useHelperContext()();
  const [filterSender, setFilterSender] = useState<string>("");
  const [filterSubject, setFilterSubject] = useState<string>("");
  const [filterStartDate, setFilterStartDate] = useState<string>("");
  const [filterEndDate, setFilterEndDate] = useState<string>("");
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [isBackgroundLoading, setIsBackgroundLoading] =
    useState<boolean>(false);
  const [cachedCount, setCachedCount] = useState<number>(0);
  const [isSearchMode, setIsSearchMode] = useState<boolean>(false);
  const [apiPageToken, setApiPageToken] = useState<string>("");
  const [searchOffset, setSearchOffset] = useState<number>(0);
  const [hasNextPage, setHasNextPage] = useState<boolean>(false);
  const [hasPrevPage, setHasPrevPage] = useState<boolean>(false);

  useEffect(() => {
    void fetchInitialEmails();
    void backgroundLoadLast60Days();
    void refreshCachedCount();
    const initDefaults = () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const endStr = today.toISOString().slice(0, 10);
      const start = new Date(today);
      start.setMonth(start.getMonth() - 1);
      const startStr = start.toISOString().slice(0, 10);
      setFilterStartDate((prev) => prev || startStr);
      setFilterEndDate((prev) => prev || endStr);
    };
    initDefaults();
  }, [userInfo]);

  const clampDateRange = (
    startStr: string,
    endStr: string,
  ): { start: string; end: string } => {
    if (!startStr && !endStr) {
      return { start: startStr, end: endStr };
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const parse = (s: string) => {
      const d = new Date(`${s}T00:00:00`);
      d.setHours(0, 0, 0, 0);
      return d;
    };
    let start = startStr ? parse(startStr) : null;
    let end = endStr ? parse(endStr) : null;
    if (end && end > today) end = today;
    if (!start && end) {
      const tmp = new Date(end);
      tmp.setMonth(tmp.getMonth() - 1);
      start = tmp;
    }
    if (!end && start) {
      const tmp = new Date(start);
      tmp.setMonth(tmp.getMonth() + 1);
      end = tmp > today ? today : tmp;
    }
    if (start && end) {
      const maxSpanMs = 62 * 24 * 60 * 60 * 1000; // ~2 months cap
      const span = end.getTime() - start.getTime();
      if (span > maxSpanMs) {
        // Prefer clamping end if user changed start; caller decides which one changed
        const clampedEnd = new Date(start.getTime() + maxSpanMs);
        end = clampedEnd > today ? today : clampedEnd;
      }
    }
    const toStr = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");
    return { start: toStr(start), end: toStr(end) };
  };

  const refreshCachedCount = async () => {
    if (typeof userInfo?.email === "undefined") return;
    const prefix = `email_detail:${userInfo.email}:`;
    const n = await idbCountKeysByPrefix(prefix);
    setCachedCount(n);
  };

  const fetchInitialEmails = async (pageToken = "") => {
    if (typeof userInfo?.email === "undefined") {
      return;
    }
    setFullLoading(true);
    try {
      const folderId = "INBOX";
      const response = await backendClient.getEmailList(
        userInfo?.email ?? "",
        20,
        folderId,
        pageToken,
      );
      if (isErrorResponse(response)) {
        return;
      }
      const messageIds = response.data.items;
      const emailDetailList: EmailDetail[] = [];
      for (let index = 0; index < messageIds.length; index++) {
        const emailDetail = await backendClient.getEmailDetail(
          userInfo?.email ?? "",
          messageIds[index],
        );
        if (isErrorResponse(emailDetail)) {
          continue;
        }
        emailDetailList.push(emailDetail.data.message);
      }
      setEmailDetails(emailDetailList);
      setApiPageToken(response.data.page_token || "");
      setHasNextPage(response.data.has_more || false);
      setHasPrevPage(pageToken !== "");
      setIsSearchMode(false);
    } finally {
      setFullLoading(false);
    }
  };

  const backgroundLoadLast60Days = async (): Promise<void> => {
    if (typeof userInfo?.email === "undefined") {
      return;
    }
    setIsBackgroundLoading(true);
    try {
      const cutoff = Date.now() - 60 * 24 * 60 * 60 * 1000;
      let hasMore = true;
      const folderId = "INBOX";
      const bgTokenKey = `bgPageToken:${userInfo.email}:${folderId}`;
      let pageToken = (await idbGetItem(bgTokenKey)) || "";
      const accumulated: EmailDetail[] = [];
      const parseToTime = (value: string): number => {
        const num = Number(value);
        if (!Number.isNaN(num)) {
          const ms = num < 1_000_000_000_000 ? num * 1000 : num;
          return ms;
        }
        const d = new Date(value);
        return d.getTime();
      };

      const sleep = (ms: number) =>
        new Promise((resolve) => setTimeout(resolve, ms));

      while (hasMore) {
        const listResponse = await backendClient.getEmailList(
          userInfo?.email ?? "",
          20,
          folderId,
          pageToken,
        );
        if (isErrorResponse(listResponse)) {
          break;
        }
        const ids = listResponse.data.items;
        try {
          const nextBgToken = listResponse.data.page_token ?? "";
          await idbSetItem(bgTokenKey, nextBgToken);
        } catch {}
        for (let i = 0; i < ids.length; i++) {
          const detailResp = await backendClient.getEmailDetail(
            userInfo?.email ?? "",
            ids[i],
          );
          if (isErrorResponse(detailResp)) {
            continue;
          }
          const detail = detailResp.data.message;
          const time = parseToTime(detail.internal_date);
          if (!Number.isNaN(time) && time < cutoff) {
            hasMore = false;
            break;
          }
          accumulated.push(detail);
          void refreshCachedCount();
        }

        hasMore = hasMore && listResponse.data.has_more;
        pageToken = listResponse.data.page_token;
        if (!hasMore) {
          break;
        }
        await sleep(1000);
        if (accumulated.length > 2000) {
          break;
        }
      }

      if (accumulated.length > 0) {
        void refreshCachedCount();
      }
    } finally {
      setIsBackgroundLoading(false);
    }
  };

  const matchesFilter = (detail: EmailDetail): boolean => {
    const sender = detail.head_from.mail_address?.toLowerCase() ?? "";
    const subject = detail.subject?.toLowerCase() ?? "";
    const senderQuery = filterSender.trim().toLowerCase();
    const subjectQuery = filterSubject.trim().toLowerCase();
    const senderOk = senderQuery === "" || sender.includes(senderQuery);
    const subjectOk = subjectQuery === "" || subject.includes(subjectQuery);
    const parseToDate = (value: string): Date => {
      const numeric = Number(value);
      if (!Number.isNaN(numeric)) {
        const ms = numeric < 1_000_000_000_000 ? numeric * 1000 : numeric;
        return new Date(ms);
      }
      return new Date(value);
    };
    const emailDate = parseToDate(detail.internal_date);
    const inRange = (() => {
      if (filterStartDate) {
        const start = new Date(`${filterStartDate}T00:00:00`);
        if (emailDate < start) return false;
      }
      if (filterEndDate) {
        const end = new Date(`${filterEndDate}T23:59:59.999`);
        if (emailDate > end) return false;
      }
      return true;
    })();
    return senderOk && subjectOk && inRange;
  };

  const fetchFilteredEmails = async (offset = 0) => {
    setIsSearching(true);
    setFullLoading(true);
    try {
      if (typeof userInfo?.email === "undefined") {
        setEmailDetails([]);
        return;
      }
      const prefix = `email_detail:${userInfo.email}:`;
      const entries = await idbGetValuesByPrefix(prefix);
      const details: EmailDetail[] = [];
      for (const it of entries) {
        try {
          const parsed = JSON.parse(it.value) as {
            data?: { message?: EmailDetail };
          };
          const message = parsed?.data?.message;
          if (message && message.message_id) {
            details.push(message);
          }
        } catch {}
      }
      const uniqueMap = new Map<string, EmailDetail>();
      for (const d of details) uniqueMap.set(d.message_id, d);
      const uniqueDetails = Array.from(uniqueMap.values());
      const filtered = uniqueDetails.filter((d) => matchesFilter(d));
      const toMs = (val: string): number => {
        const n = Number(val);
        if (!Number.isNaN(n)) {
          return n < 1_000_000_000_000 ? n * 1000 : n;
        }
        const t = new Date(val).getTime();
        return Number.isNaN(t) ? 0 : t;
      };
      filtered.sort((a, b) => toMs(b.internal_date) - toMs(a.internal_date));
      const pageSize = 20;
      const startIndex = offset * pageSize;
      const endIndex = startIndex + pageSize;
      setEmailDetails(filtered.slice(startIndex, endIndex));
      setSearchOffset(offset);
      setHasNextPage(endIndex < filtered.length);
      setHasPrevPage(offset > 0);
      setIsSearchMode(true);
    } finally {
      setIsSearching(false);
      setFullLoading(false);
    }
  };

  const formatEmailDate = (value: string): string => {
    if (!value) return "";
    const numeric = Number(value);
    let date: Date;
    if (!Number.isNaN(numeric)) {
      const ms = numeric < 1_000_000_000_000 ? numeric * 1000 : numeric;
      date = new Date(ms);
    } else {
      date = new Date(value);
    }
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat("th-TH", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(date);
  };

  const convertEmailDetailToEmailList = (input: EmailDetail): EmailList => {
    let attachment_content =
      "<b>" + input.attachments.length + " file(s)</b><br/>";
    let count = 0;
    for (const attachment of input.attachments) {
      if (count == 0) {
        attachment_content += `<span class="text-gray-400">${attachment.filename} </span>`;
      }
      if (count == 1) {
        attachment_content += `<span class="text-gray-400">and more </span>`;
      }
      count += 1;
    }
    return {
      id: input.message_id,
      subject: input.subject,
      head_from_email: input.head_from.mail_address,
      attachment_content:
        input.attachments.length > 0 ? attachment_content : "",
      date: formatEmailDate(input.internal_date),
      data: input,
    };
  };

  const tranformData = (input: EmailDetail[]): EmailList[] => {
    return input.map((item) => convertEmailDetailToEmailList(item));
  };

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": "calc(var(--spacing) * 72)",
          "--header-height": "calc(var(--spacing) * 12)",
        } as React.CSSProperties
      }
    >
      <AppSidebar variant="inset" />
      <SidebarInset>
        <SiteHeader />
        <div className="flex flex-1 flex-col">
          <div className="@container/main flex flex-1 flex-col gap-2">
            <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6 px-4">
              <div className="flex flex-col gap-2 md:flex-row md:items-end">
                <div className="flex-1">
                  <label className="mb-1 block text-sm font-medium">
                    ผู้ส่ง
                  </label>
                  <Input
                    placeholder="กรองด้วยอีเมลผู้ส่ง"
                    value={filterSender}
                    onChange={(e) => setFilterSender(e.target.value)}
                  />
                </div>
                <div className="flex-1">
                  <label className="mb-1 block text-sm font-medium">
                    หัวข้อ
                  </label>
                  <Input
                    placeholder="กรองด้วยหัวข้ออีเมล"
                    value={filterSubject}
                    onChange={(e) => setFilterSubject(e.target.value)}
                  />
                </div>
                <div className="flex-1">
                  <label className="mb-1 block text-sm font-medium">
                    วันที่เริ่ม
                  </label>
                  <Input
                    type="date"
                    value={filterStartDate}
                    max={filterEndDate || undefined}
                    onChange={(e) => {
                      const raw = e.target.value;
                      const { start, end } = clampDateRange(raw, filterEndDate);
                      setFilterStartDate(start);
                      setFilterEndDate(end);
                    }}
                  />
                </div>
                <div className="flex-1">
                  <label className="mb-1 block text-sm font-medium">
                    วันที่สิ้นสุด
                  </label>
                  <Input
                    type="date"
                    value={filterEndDate}
                    min={filterStartDate || undefined}
                    max={new Date().toISOString().slice(0, 10)}
                    onChange={(e) => {
                      const raw = e.target.value;
                      const { start, end } = clampDateRange(
                        filterStartDate,
                        raw,
                      );
                      setFilterStartDate(start);
                      setFilterEndDate(end);
                    }}
                  />
                </div>
                <div className="pt-2 md:pt-0">
                  <Button
                    onClick={() => void fetchFilteredEmails(0)}
                    disabled={isSearching}
                  >
                    {isSearching ? "กำลังค้นหา..." : "ค้นหา"}
                  </Button>
                </div>
              </div>
              <div className="flex justify-between items-center">
                <Button
                  variant="outline"
                  onClick={() => {
                    if (isSearchMode) {
                      void fetchFilteredEmails(searchOffset - 1);
                    } else {
                      void fetchInitialEmails("");
                    }
                  }}
                  disabled={!hasPrevPage || isSearching}
                >
                  Previous
                </Button>
                <span className="text-sm text-gray-500">
                  {isSearchMode ? `Page ${searchOffset + 1}` : ""}
                </span>
                <Button
                  variant="outline"
                  onClick={() => {
                    if (isSearchMode) {
                      void fetchFilteredEmails(searchOffset + 1);
                    } else {
                      void fetchInitialEmails(apiPageToken);
                    }
                  }}
                  disabled={!hasNextPage || isSearching}
                >
                  Next
                </Button>
              </div>
              <div className="md:ml-auto text-xs text-gray-500 md:pt-0">
                {isBackgroundLoading ? (
                  <span>Syncing {cachedCount} email..</span>
                ) : (
                  <span>All Data Sync</span>
                )}
              </div>
              <DataTable
                data={tranformData(emailDetails)}
                columns={columns}
                onClickRow={(emailList) => setShowEmailDetail(emailList.data)}
              />
            </div>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
