"use client";

import { useMemo, useState } from "react";
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  RowSelectionState,
  useReactTable,
} from "@tanstack/react-table";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  onClickRow: (data: TData) => void;
  onSelectionChange?: (selectedRows: TData[]) => void;
}

export function DataTable<TData, TValue>({
  columns,
  data,
  onClickRow,
  onSelectionChange,
}: DataTableProps<TData, TValue>) {
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const augmentedColumns = useMemo<ColumnDef<TData, unknown>[]>(() => {
    const selectColumn: ColumnDef<TData, unknown> = {
      id: "select",
      header: ({ table }) => (
        <div className="pl-2">
          <Checkbox
            checked={
              table.getIsAllPageRowsSelected()
                ? true
                : table.getIsSomePageRowsSelected()
                ? "indeterminate"
                : false
            }
            className="cursor-pointer"
            onCheckedChange={(value) =>
              table.toggleAllPageRowsSelected(!!value)
            }
            aria-label="Select all"
          />
        </div>
      ),
      cell: ({ row }) => (
        <div className="pl-2" onClick={(e) => e.stopPropagation()}>
          <Checkbox
            checked={row.getIsSelected()}
            className="cursor-pointer"
            onCheckedChange={(value) => row.toggleSelected(!!value)}
            aria-label="Select row"
          />
        </div>
      ),
      enableSorting: false,
      enableHiding: false,
      size: 32,
    };
    return [
      selectColumn as ColumnDef<TData, unknown>,
      ...(columns as ColumnDef<TData, unknown>[]),
    ];
  }, [columns]);

  const table = useReactTable({
    data,
    columns: augmentedColumns as ColumnDef<TData, TValue>[],
    state: { rowSelection },
    enableRowSelection: true,
    onRowSelectionChange: (updater) => {
      setRowSelection(updater);
      // Call onSelectionChange with selected rows
      if (onSelectionChange) {
        const newSelection =
          typeof updater === "function" ? updater(rowSelection) : updater;
        const selectedRows = data.filter((_, index) => newSelection[index]);
        onSelectionChange(selectedRows);
      }
    },
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="overflow-hidden rounded-md border">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => {
                return (
                  <TableHead key={header.id} className="font-bold">
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                  </TableHead>
                );
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows?.length ? (
            table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                data-state={row.getIsSelected() && "selected"}
                className="cursor-pointer"
                onClick={() => onClickRow(row.original)}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    <div className="max-w-[340px] truncate">
                      {(() => {
                        const shouldRenderHtml =
                          (
                            cell.column.columnDef as {
                              meta?: { renderHtml?: boolean };
                            }
                          ).meta?.renderHtml === true;

                        if (shouldRenderHtml) {
                          const html = String(cell.getValue() ?? "");
                          return (
                            <div dangerouslySetInnerHTML={{ __html: html }} />
                          );
                        }

                        const rendered = flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext(),
                        );

                        if (typeof rendered === "string") {
                          return (
                            <div
                              dangerouslySetInnerHTML={{ __html: rendered }}
                            />
                          );
                        }
                        return rendered;
                      })()}
                    </div>
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={columns.length} className="h-24 text-center">
                ไม่พบข้อมูล ;-;
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
