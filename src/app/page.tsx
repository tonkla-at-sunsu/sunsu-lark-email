/* eslint-disable react-hooks/exhaustive-deps */
"use client";
import { AppSidebar } from "@/components/app-sidebar";
import { SiteHeader } from "@/components/site-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { DataTable } from "./DataTable";
import { ColumnDef } from "@tanstack/react-table";
import { useEffect, useState } from "react";
import { EmailDetail, isErrorResponse, Folder } from "@/types/request";
import { useHelperContext } from "@/components/providers/helper-provider";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Filter, ChevronDown, Download } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  idbGetItem,
  idbSetItem,
  idbCountKeysByPrefix,
  idbGetValuesByPrefix,
  saveFilter,
  getSavedFilters,
  deleteSavedFilter,
  SavedFilter,
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
  const {
    backendClient,
    userInfo,
    setShowEmailDetail,
    setFullLoading,
    setAlert,
  } = useHelperContext()();
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
  const [savedFilters, setSavedFilters] = useState<SavedFilter[]>([]);
  const [showSaveFilterDialog, setShowSaveFilterDialog] =
    useState<boolean>(false);
  const [filterName, setFilterName] = useState<string>("");
  const [isTabActive, setIsTabActive] = useState<boolean>(true);
  const [isBackgroundLoadingInOtherTab, setIsBackgroundLoadingInOtherTab] =
    useState<boolean>(false);
  const [selectedEmails, setSelectedEmails] = useState<EmailList[]>([]);
  const [showDownloadDialog, setShowDownloadDialog] = useState<boolean>(false);
  const [availableExtensions, setAvailableExtensions] = useState<string[]>([]);
  const [selectedExtensions, setSelectedExtensions] = useState<string[]>([]);
  const [isDownloading, setIsDownloading] = useState<boolean>(false);
  const [totalFileCount, setTotalFileCount] = useState<number>(0);
  const [fileCountByExtension, setFileCountByExtension] = useState<
    Record<string, number>
  >({});
  const [availableFolders, setAvailableFolders] = useState<Folder[]>([
    {
      id: "INBOX",
      name: "INBOX",
      parent_folder_id: "",
      folder_type: 0,
      unread_message_count: 0,
      unread_thread_count: 0,
    },
  ]);
  const [selectedFolderId, setSelectedFolderId] = useState<string>("INBOX");

  useEffect(() => {
    void fetchInitialEmails();
    void backgroundLoad();
    void refreshCachedCount();
    void loadSavedFilters();
    void fetchFolders();
    const initDefaults = () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const endStr =
        today.getFullYear() +
        "-" +
        String(today.getMonth() + 1).padStart(2, "0") +
        "-" +
        String(today.getDate()).padStart(2, "0");
      const start = new Date(today);
      start.setMonth(start.getMonth() - 1);
      const startStr =
        start.getFullYear() +
        "-" +
        String(start.getMonth() + 1).padStart(2, "0") +
        "-" +
        String(start.getDate()).padStart(2, "0");
      setFilterStartDate((prev) => prev || startStr);
      setFilterEndDate((prev) => prev || endStr);
    };
    initDefaults();

    const handleVisibilityChange = () => {
      const isVisible = !document.hidden;
      setIsTabActive(isVisible);
    };

    let broadcastChannel: BroadcastChannel | null = null;
    if (typeof window !== "undefined" && "BroadcastChannel" in window) {
      broadcastChannel = new BroadcastChannel("background-loading");

      broadcastChannel.onmessage = (event) => {
        if (event.data.type === "background-loading-started") {
          setIsBackgroundLoadingInOtherTab(true);
        } else if (event.data.type === "background-loading-finished") {
          setIsBackgroundLoadingInOtherTab(false);
        }
      };
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (broadcastChannel) {
        broadcastChannel.close();
      }
    };
  }, [userInfo]);

  // Update file count when selected extensions or emails change
  useEffect(() => {
    if (selectedExtensions.length === 0 || selectedEmails.length === 0) {
      setTotalFileCount(0);
      setFileCountByExtension({});
      return;
    }

    let count = 0;
    const countByExt: Record<string, number> = {};

    selectedEmails.forEach((email) => {
      email.data.attachments.forEach((attachment) => {
        const filename = attachment.filename || "";
        const extension = filename.split(".").pop()?.toLowerCase();
        if (extension && selectedExtensions.includes(extension)) {
          count++;
          countByExt[extension] = (countByExt[extension] || 0) + 1;
        }
      });
    });

    setTotalFileCount(count);
    setFileCountByExtension(countByExt);
  }, [selectedExtensions, selectedEmails]);

  const clampDateRange = (
    startStr: string,
    endStr: string,
  ): { start: string; end: string } => {
    if (!startStr && !endStr) {
      return { start: startStr, end: endStr };
    }

    const today = new Date();
    today.setHours(23, 59, 59, 999); // Set to end of today

    const parse = (s: string) => {
      if (!s) return null;
      // Create date in local timezone to avoid timezone issues
      const [year, month, day] = s.split("-").map(Number);
      const d = new Date(year, month - 1, day);
      return d;
    };

    let start = startStr ? parse(startStr) : null;
    let end = endStr ? parse(endStr) : null;

    // Ensure end date is not in the future
    if (end && end > today) {
      end = new Date(today);
    }

    // Auto-set start date if only end date is provided
    if (!start && end) {
      const tmp = new Date(end);
      tmp.setMonth(tmp.getMonth() - 1);
      start = tmp;
    }

    // Auto-set end date if only start date is provided
    if (!end && start) {
      const tmp = new Date(start);
      tmp.setMonth(tmp.getMonth() + 1);
      end = tmp > today ? new Date(today) : tmp;
    }

    // Ensure start date is not after end date
    if (start && end && start > end) {
      start = new Date(end);
    }

    // Limit date range to 62 days
    if (start && end) {
      const maxSpanMs = 62 * 24 * 60 * 60 * 1000;
      const span = end.getTime() - start.getTime();
      if (span > maxSpanMs) {
        const clampedEnd = new Date(start.getTime() + maxSpanMs);
        end = clampedEnd > today ? new Date(today) : clampedEnd;
      }
    }

    const toStr = (d: Date | null) => {
      if (!d) return "";
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    };

    return { start: toStr(start), end: toStr(end) };
  };

  const refreshCachedCount = async () => {
    if (typeof userInfo?.email === "undefined") return;
    const prefix = `email_detail:${userInfo.email}:`;
    const n = await idbCountKeysByPrefix(prefix);
    setCachedCount(n);
  };

  const fetchFolders = async () => {
    if (typeof userInfo?.email === "undefined") return;
    try {
      const response = await backendClient.getEmailListFolder(userInfo.email);
      if (isErrorResponse(response)) {
        return;
      }
      setAvailableFolders([
        {
          id: "INBOX",
          name: "INBOX",
          parent_folder_id: "",
          folder_type: 0,
          unread_message_count: 0,
          unread_thread_count: 0,
        },
        ...(response.data?.items || []),
      ]);
    } catch (error) {
      console.error("Error fetching folders:", error);
    }
  };

  const fetchInitialEmails = async (pageToken = "") => {
    if (typeof userInfo?.email === "undefined") {
      return;
    }
    setFullLoading(true);
    try {
      const response = await backendClient.getEmailList(
        userInfo?.email ?? "",
        20,
        selectedFolderId,
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

  const backgroundLoad = async (): Promise<void> => {
    if (typeof userInfo?.email === "undefined") {
      return;
    }

    if (isBackgroundLoadingInOtherTab) {
      return;
    }

    if (!isTabActive) {
      return;
    }

    setIsBackgroundLoading(true);

    if (typeof window !== "undefined" && "BroadcastChannel" in window) {
      const broadcastChannel = new BroadcastChannel("background-loading");
      broadcastChannel.postMessage({ type: "background-loading-started" });
      broadcastChannel.close();
    }

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
        if (!isTabActive) {
          break;
        }

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
        await sleep(1200);
        if (accumulated.length > 2000) {
          break;
        }
      }

      if (accumulated.length > 0) {
        void refreshCachedCount();
      }
    } finally {
      setIsBackgroundLoading(false);

      // Broadcast to other tabs that background loading has finished
      if (typeof window !== "undefined" && "BroadcastChannel" in window) {
        const broadcastChannel = new BroadcastChannel("background-loading");
        broadcastChannel.postMessage({ type: "background-loading-finished" });
        broadcastChannel.close();
      }
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
        // Parse start date in local timezone
        const [startYear, startMonth, startDay] = filterStartDate
          .split("-")
          .map(Number);
        const start = new Date(startYear, startMonth - 1, startDay, 0, 0, 0, 0);
        if (emailDate < start) return false;
      }
      if (filterEndDate) {
        // Parse end date in local timezone
        const [endYear, endMonth, endDay] = filterEndDate
          .split("-")
          .map(Number);
        const end = new Date(endYear, endMonth - 1, endDay, 23, 59, 59, 999);
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

      if (selectedFolderId !== "INBOX") {
        const response = await backendClient.getEmailList(
          userInfo?.email ?? "",
          20,
          selectedFolderId,
          offset > 0 ? apiPageToken : "",
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

        const filtered = emailDetailList.filter((d) => matchesFilter(d));
        setEmailDetails(filtered);
        setApiPageToken(response.data.page_token || "");
        setHasNextPage(response.data.has_more || false);
        setHasPrevPage(offset > 0);
        setIsSearchMode(true);
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

  const loadSavedFilters = async () => {
    if (typeof userInfo?.email === "undefined") return;
    try {
      const filters = await getSavedFilters(userInfo.email);
      setSavedFilters(filters);
    } catch (error) {
      console.error("Error loading saved filters:", error);
    }
  };

  const handleSaveFilter = async () => {
    if (!filterName.trim() || typeof userInfo?.email === "undefined") return;

    try {
      await saveFilter(userInfo.email, {
        name: filterName.trim(),
        sender: filterSender,
        subject: filterSubject,
      });
      setFilterName("");
      setShowSaveFilterDialog(false);
      await loadSavedFilters();
    } catch (error) {
      console.error("Error saving filter:", error);
    }
  };

  const handleLoadFilter = (filter: SavedFilter) => {
    setFilterSender(filter.sender);
    setFilterSubject(filter.subject);
    setShowSaveFilterDialog(false);
    // Auto search after loading filter
    setTimeout(() => {
      void fetchFilteredEmails(0);
    }, 100);
  };

  const handleDeleteFilter = async (filterId: string) => {
    if (typeof userInfo?.email === "undefined") return;

    try {
      await deleteSavedFilter(userInfo.email, filterId);
      await loadSavedFilters();
    } catch (error) {
      console.error("Error deleting filter:", error);
    }
  };

  const handleClearFilters = () => {
    setFilterSender("");
    setFilterSubject("");
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const endStr =
      today.getFullYear() +
      "-" +
      String(today.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(today.getDate()).padStart(2, "0");
    const start = new Date(today);
    start.setMonth(start.getMonth() - 1);
    const startStr =
      start.getFullYear() +
      "-" +
      String(start.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(start.getDate()).padStart(2, "0");
    setFilterStartDate(startStr);
    setFilterEndDate(endStr);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      void fetchFilteredEmails(0);
    }
  };

  // Batch download functions
  const handleSelectionChange = (selectedRows: EmailList[]) => {
    setSelectedEmails(selectedRows);
  };

  const openDownloadDialog = () => {
    if (selectedEmails.length === 0) return;

    const extensions = new Set<string>();
    selectedEmails.forEach((email) => {
      email.data.attachments.forEach((attachment) => {
        const filename = attachment.filename || "";
        const extension = filename.split(".").pop()?.toLowerCase();
        if (extension) {
          extensions.add(extension);
        }
      });
    });

    const extensionsArray = Array.from(extensions).sort();
    setAvailableExtensions(extensionsArray);
    setSelectedExtensions(extensionsArray);
    setShowDownloadDialog(true);
  };

  const handleDownload = async () => {
    if (selectedEmails.length === 0 || selectedExtensions.length === 0) return;

    setIsDownloading(true);
    try {
      const emailAttachments = selectedEmails
        .map((email) => {
          const filteredAttachments = email.data.attachments.filter(
            (attachment) => {
              const filename = attachment.filename || "";
              const extension = filename.split(".").pop()?.toLowerCase();
              return extension && selectedExtensions.includes(extension);
            },
          );
          return {
            email_id: email.data.message_id,
            attachment_ids: filteredAttachments.map(
              (attachment) => attachment.id,
            ),
          };
        })
        .filter((item) => item.attachment_ids.length > 0);

      if (emailAttachments.length === 0) {
        setAlert(
          "เกิดข้อผิดพลาด",
          "ไม่มีไฟล์ที่ตรงกับนามสกุลที่เลือก",
          () => {},
          false,
        );
        return;
      }

      setFullLoading(true, true);
      const response = await fetch("/api/email/batch-download", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          user_email: userInfo?.email,
          email_attachments: emailAttachments,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Download failed:", errorText);
        throw new Error(`Download failed: ${response.status} ${errorText}`);
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `email-attachments-${new Date()
        .toISOString()
        .slice(0, 10)}.zip`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      setShowDownloadDialog(false);
      setFullLoading(false, false);
    } catch (error) {
      setAlert(
        "เกิดข้อผิดพลาด",
        `เกิดข้อผิดพลาดในการดาวน์โหลด ${error}`,
        () => {},
        false,
      );
    } finally {
      setIsDownloading(false);
    }
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
                    โฟลเดอร์
                  </label>
                  <Select
                    value={selectedFolderId}
                    onValueChange={(value) => {
                      setSelectedFolderId(value);
                      // Clear filters when changing folder
                      if (value !== "INBOX") {
                        setFilterSender("");
                        setFilterSubject("");
                      }
                      void fetchInitialEmails("");
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="เลือกโฟลเดอร์" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableFolders.map((folder) => (
                        <SelectItem key={folder.id} value={folder.id}>
                          {folder.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex-1">
                  <label className="mb-1 block text-sm font-medium">
                    ผู้ส่ง
                  </label>
                  <Input
                    placeholder="กรองด้วยอีเมลผู้ส่ง"
                    value={filterSender}
                    onChange={(e) => setFilterSender(e.target.value)}
                    onKeyDown={handleKeyDown}
                    disabled={selectedFolderId !== "INBOX"}
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
                    onKeyDown={handleKeyDown}
                    disabled={selectedFolderId !== "INBOX"}
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
                      // Only update if values actually changed to prevent infinite loops
                      if (start !== filterStartDate) {
                        setFilterStartDate(start);
                      }
                      if (end !== filterEndDate) {
                        setFilterEndDate(end);
                      }
                    }}
                    onKeyDown={handleKeyDown}
                    disabled={selectedFolderId !== "INBOX"}
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
                    onChange={(e) => {
                      const raw = e.target.value;
                      const { start, end } = clampDateRange(
                        filterStartDate,
                        raw,
                      );
                      // Only update if values actually changed to prevent infinite loops
                      if (start !== filterStartDate) {
                        setFilterStartDate(start);
                      }
                      if (end !== filterEndDate) {
                        setFilterEndDate(end);
                      }
                    }}
                    onKeyDown={handleKeyDown}
                    disabled={selectedFolderId !== "INBOX"}
                  />
                </div>
                <div className="pt-2 md:pt-0 flex gap-2">
                  <Button
                    onClick={() => void fetchFilteredEmails(0)}
                    className="hover:shadow-md transition-all duration-200 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isSearching ? "กำลังค้นหา..." : "ค้นหา"}
                  </Button>
                  {selectedEmails.length > 0 && (
                    <Button
                      onClick={openDownloadDialog}
                      disabled={selectedEmails.length === 0}
                      variant="outline"
                      className="hover:shadow-md transition-all duration-200 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Download className="w-4 h-4 mr-2" />
                      ดาวน์โหลด ({selectedEmails.length})
                    </Button>
                  )}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="outline"
                        disabled={selectedFolderId !== "INBOX"}
                        className="transition-colors duration-200 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Filter className="w-4 h-4 mr-2" />
                        ตัวกรอง
                        <ChevronDown className="w-4 h-4 ml-2" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                      {savedFilters.length > 0 ? (
                        savedFilters.map((filter) => (
                          <div
                            key={filter.id}
                            className="flex items-center justify-between"
                          >
                            <DropdownMenuItem
                              onClick={() => handleLoadFilter(filter)}
                              className="cursor-pointer flex-1"
                            >
                              {filter.name}
                            </DropdownMenuItem>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 w-6 p-0 text-red-600 hover:text-red-800 hover:bg-red-50"
                                >
                                  ×
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>ลบตัวกรอง</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    คุณแน่ใจหรือไม่ที่จะลบตัวกรอง {filter.name}?
                                    <br />
                                    การกระทำนี้ไม่สามารถย้อนกลับได้
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() =>
                                      handleDeleteFilter(filter.id)
                                    }
                                    className="bg-red-600 hover:bg-red-700"
                                  >
                                    ลบ
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        ))
                      ) : (
                        <DropdownMenuItem disabled>
                          ไม่มีตัวกรองที่บันทึกไว้
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem
                        onClick={handleClearFilters}
                        className="cursor-pointer text-red-600 hover:text-red-800 hover:bg-red-50"
                      >
                        เคลียร์ตัวกรองทั้งหมด
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => setShowSaveFilterDialog(true)}
                        disabled={!filterSender && !filterSubject}
                        className="cursor-pointer"
                      >
                        บันทึกตัวกรองใหม่
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
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
                  className="hover:bg-gray-50 hover:border-gray-400 transition-colors duration-200 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
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
                  className="hover:bg-gray-50 hover:border-gray-400 transition-colors duration-200 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Next
                </Button>
              </div>
              <div className="md:ml-auto text-xs text-gray-500 md:pt-0">
                {isBackgroundLoading ? (
                  <span>Syncing {cachedCount.toLocaleString()} email</span>
                ) : isBackgroundLoadingInOtherTab ? (
                  <span>Syncing in another tab</span>
                ) : (
                  <span>
                    All Data Sync ({cachedCount.toLocaleString()} email)
                  </span>
                )}
              </div>
              <DataTable
                data={tranformData(emailDetails)}
                columns={columns}
                onClickRow={(emailList) => setShowEmailDetail(emailList.data)}
                onSelectionChange={handleSelectionChange}
              />
            </div>
          </div>
        </div>
      </SidebarInset>

      {/* Save Filter Dialog */}
      <AlertDialog
        open={showSaveFilterDialog}
        onOpenChange={setShowSaveFilterDialog}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>บันทึก Filter</AlertDialogTitle>
            <AlertDialogDescription>
              ตั้งชื่อสำหรับ filter นี้เพื่อใช้ในครั้งต่อไป
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <Input
              placeholder="ชื่อ Filter (เช่น: อีเมลจากบริษัท ABC)"
              value={filterName}
              onChange={(e) => setFilterName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  void handleSaveFilter();
                }
              }}
            />
            <div className="mt-2 text-sm text-gray-600">
              <div>ผู้ส่ง: {filterSender || "(ไม่ระบุ)"}</div>
              <div>หัวข้อ: {filterSubject || "(ไม่ระบุ)"}</div>
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => setShowSaveFilterDialog(false)}
              className="hover:bg-gray-100 transition-colors duration-200 cursor-pointer"
            >
              ยกเลิก
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleSaveFilter}
              disabled={!filterName.trim()}
              className="hover:shadow-md transition-all duration-200 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
            >
              บันทึก
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Download Dialog */}
      <AlertDialog
        open={showDownloadDialog}
        onOpenChange={setShowDownloadDialog}
      >
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>เลือกไฟล์ที่ต้องการดาวน์โหลด</AlertDialogTitle>
            <AlertDialogDescription>
              เลือกนามสกุลไฟล์ที่ต้องการดาวน์โหลดจาก {selectedEmails.length}{" "}
              อีเมลที่เลือก
              <br />
              <span className="font-medium text-blue-600">
                จำนวนไฟล์ที่จะดาวน์โหลด: {totalFileCount} ไฟล์
              </span>
              {totalFileCount > 0 && (
                <div className="mt-2 text-sm text-gray-600">
                  <div className="font-medium mb-1">รายละเอียดไฟล์:</div>
                  {Object.entries(fileCountByExtension)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([extension, count]) => (
                      <div key={extension} className="ml-2">
                        • .{extension}: {count} ไฟล์
                      </div>
                    ))}
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="select-all"
                  checked={
                    selectedExtensions.length === availableExtensions.length
                  }
                  onCheckedChange={(checked: boolean) => {
                    if (checked) {
                      setSelectedExtensions([...availableExtensions]);
                    } else {
                      setSelectedExtensions([]);
                    }
                  }}
                />
                <label htmlFor="select-all" className="text-sm font-medium">
                  เลือกทั้งหมด
                </label>
              </div>
              <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto">
                {availableExtensions.map((extension) => (
                  <div key={extension} className="flex items-center space-x-2">
                    <Checkbox
                      id={extension}
                      checked={selectedExtensions.includes(extension)}
                      onCheckedChange={(checked: boolean) => {
                        if (checked) {
                          setSelectedExtensions([
                            ...selectedExtensions,
                            extension,
                          ]);
                        } else {
                          setSelectedExtensions(
                            selectedExtensions.filter(
                              (ext) => ext !== extension,
                            ),
                          );
                        }
                      }}
                    />
                    <label htmlFor={extension} className="text-sm">
                      .{extension}
                    </label>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => setShowDownloadDialog(false)}
              className="hover:bg-gray-100 transition-colors duration-200 cursor-pointer"
            >
              ยกเลิก
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDownload}
              disabled={selectedExtensions.length === 0 || isDownloading}
              className="hover:shadow-md transition-all duration-200 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isDownloading ? "กำลังดาวน์โหลด..." : "ดาวน์โหลด"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SidebarProvider>
  );
}
