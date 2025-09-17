"use client";
import * as React from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Separator } from "@/components/ui/separator";
import { EmailDetail } from "@/types/request";
import { decodeBase64Utf8 } from "@/lib/utils";
import { useHelperContext } from "./providers/helper-provider";

export function SectionCard({
  item,
  open,
  onOpenChange,
}: {
  item: EmailDetail;
  open?: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const isMobile = useIsMobile();
  const { backendClient, userInfo } = useHelperContext()();

  const onDowload = async () => {
    await backendClient.getDowloadAttachmentFiles(
      userInfo?.email ?? "",
      item.message_id,
      item.attachments.map((i) => i.id),
    );
  };

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      direction={isMobile ? "bottom" : "right"}
    >
      <DrawerContent
        className={
          isMobile
            ? undefined
            : "data-[vaul-drawer-direction=right]:!w-[50vw] sm:!max-w-none"
        }
      >
        <DrawerHeader className="gap-1">
          <DrawerTitle className="select-text">{item.subject}</DrawerTitle>
          <DrawerDescription className="select-text">
            จาก{" "}
            <b>
              {item.head_from.mail_address} ({item.head_from.name})
            </b>
          </DrawerDescription>
        </DrawerHeader>
        <div className="flex flex-col gap-4 overflow-y-auto px-4 text-sm">
          {!isMobile && (
            <>
              <Separator />
              <div
                className="prose prose-sm max-w-none select-text"
                dangerouslySetInnerHTML={{
                  __html: decodeBase64Utf8(
                    item.body_html || item.body_plain_text,
                  ),
                }}
              />
              <Separator />
            </>
          )}

          {isMobile && (
            <>
              <div className="flex flex-col gap-2">
                <div
                  className="prose prose-sm max-w-none select-text"
                  dangerouslySetInnerHTML={{
                    __html: decodeBase64Utf8(
                      item.body_html || item.body_plain_text,
                    ),
                  }}
                />
              </div>
            </>
          )}
        </div>
        <DrawerFooter>
          <Button
            disabled={item.attachments.length == 0}
            className="cursor-pointer"
            onClick={onDowload}
          >
            {item.attachments.length == 0
              ? "ไม่มีไฟล์"
              : `ดาวโหลด ${item.attachments.length} ไฟล์`}
          </Button>
          <DrawerClose asChild>
            <Button
              className="cursor-pointer"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              ปิดหน้าต่างนี้
            </Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
