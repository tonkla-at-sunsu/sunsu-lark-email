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
import { SectionCard } from "@/components/section-card";

export type EmailList = {
  id: string;
  subject: string;
  head_from_email: string;
  attachment_content: string;
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
    accessorKey: "attachment_content",
    header: "ไฟล์",
    meta: { renderHtml: true },
  },
];

export default function Page() {
  const [emailDetails, setEmailDetails] = useState<EmailDetail[]>([]);
  const { backendClient, userInfo, setShowEmailDetail } = useHelperContext()();

  useEffect(() => {
    fetchListEmail();
  }, [userInfo]);

  const fetchListEmail = async () => {
    if (typeof userInfo?.email === "undefined") {
      return;
    }
    const response = await backendClient.getEmailList(
      userInfo?.email ?? "",
      20,
      "INBOX",
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
      attachment_content: attachment_content,
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
