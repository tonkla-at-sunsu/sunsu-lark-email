/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import { getTenantAccessToken, handleError } from '@/lib/backend-helper';
import { getSupabaseServiceClient } from "@/lib/database";

interface WebhookRequest {
    app_id: string;
    table_id: string;
}

export async function POST(request: NextRequest) {
    try {
        const body: WebhookRequest = await request.json();
        const token = await getTenantAccessToken();
        const supabase = getSupabaseServiceClient();

        const { data: tableInfo } = await axios.get(`https://open.larksuite.com/open-apis/bitable/v1/apps/${body.app_id}/tables`, {
            headers: {
                Authorization: `Bearer ${token}`
            }
        })

        const sectionItem = tableInfo.data.items;
        if (Array.isArray(sectionItem) && sectionItem.length > 0) {
            const table = tableInfo.data?.items.find((i: any) => i.table_id === body.table_id);

            const { data: recordInfo } = await axios.post(`https://open.larksuite.com/open-apis/bitable/v1/apps/${body.app_id}/tables/${body.table_id}/records/search`, {
                "filter": {
                    "conjunction": "and",
                    "conditions": [
                        {
                            "field_name": "PIC",
                            "operator": "isNotEmpty",
                            "value": []
                        }
                    ]
                }
            }, {
                headers: {
                    Authorization: `Bearer ${token}`
                }
            })
            const items = Array.isArray(recordInfo.data.items) ? recordInfo.data.items : [];

            const baseId = body.app_id;
            const tableId = body.table_id;
            const taskListName = table?.name ?? "empty";

            for (const item of items) {
                console.log(item);
                const data = item?.fields ?? {}
                const sectionName = data?.Phase ?? "empty";
                let tasklistId = "";
                let sectionId = "";

                // find existing tasklist
                const { data: tasklistInfo } = await supabase.from('tasklist-mapping')
                    .select()
                    .eq('table_id', tableId)
                    .eq('base_id', baseId)

                if (tasklistInfo?.length == 0) {
                    // no existing tasklist -> create
                    const { data: createdTasklist } = await axios.post("https://open.larksuite.com/open-apis/task/v2/tasklists?user_id_type=open_id", {
                        "members": [{
                            "id": data.PIC[0].id,
                            "role": "viewer",
                            "type": "user"
                        }],
                        "name": taskListName
                    }, {
                        headers: {
                            Authorization: `Bearer ${token}`
                        }
                    })
                    tasklistId = createdTasklist.data.tasklist.guid;

                    const { data: sectionInfo } = await axios.post("https://open.larksuite.com/open-apis/task/v2/sections", {
                        "name": sectionName,
                        "resource_type": "tasklist",
                        "resource_id": tasklistId
                    }, {
                        headers: {
                            Authorization: `Bearer ${token}`
                        }
                    })

                    sectionId = sectionInfo.data.section.guid;

                    const { error: insertErr } = await supabase
                        .from("tasklist-mapping")
                        .insert(
                            {
                                table_id: body.table_id,
                                base_id: body.app_id,
                                tasklist_id: tasklistId,
                                tasklist_name: taskListName,
                                section_id: sectionId,
                                section_name: sectionName,
                            }
                        );
                    if (insertErr) {
                        console.error('Supabase insert error:', insertErr);
                        throw new Error(`Failed to insert tasklist mapping: ${insertErr.message}`);
                    }
                } else {
                    // existing tasklist -> get tasklist id
                    tasklistId = tasklistInfo?.[0].tasklist_id;

                    const filteredSection = tasklistInfo?.filter((i: any) => i.section_name === sectionName);

                    // find existing section
                    if (Array.isArray(filteredSection) && filteredSection.length > 0) {
                        // existing section -> get section id
                        sectionId = filteredSection[0].section_id;
                    } else {
                        // no existing section -> create
                        const { data: sectionInfo } = await axios.post("https://open.larksuite.com/open-apis/task/v2/sections", {
                            "name": sectionName,
                            "resource_type": "tasklist",
                            "resource_id": tasklistId
                        }, {
                            headers: {
                                Authorization: `Bearer ${token}`
                            }
                        })

                        sectionId = sectionInfo.data.section.guid;

                        const { error: insertErr } = await supabase
                            .from("tasklist-mapping")
                            .insert(
                                {
                                    table_id: body.table_id,
                                    base_id: body.app_id,
                                    tasklist_id: tasklistId,
                                    tasklist_name: taskListName,
                                    section_id: sectionId,
                                    section_name: sectionName,
                                }
                            );
                        if (insertErr) {
                            console.error('Supabase insert error:', insertErr);
                            throw new Error(`Failed to insert tasklist mapping: ${insertErr.message}`);
                        }
                    }
                }

                const { data: taskInfo } = await supabase.from('task-mapping')
                    .select()
                    .eq('table_id', tableId)
                    .eq('base_id', baseId)
                    .eq('record_id', item.record_id)

                if (taskInfo?.length == 0) {
                    if (!data.Status) {
                        data.Status = "Not yet started"
                    }
                    const completedAt = data.Status.toLowerCase() === "done" || data.Status.toLowerCase() === "completed" ? (new Date()).valueOf().toString() : "0"
                    const starttime = data["Start Date"] ? Number(data["Start Date"]).toString() : new Date().valueOf().toString();
                    let endtime = data["Estimate Deadline"] ? Number(data["Estimate Deadline"]).toString() : new Date().valueOf().toString();

                    if (Number(starttime) > Number(endtime)) {
                        endtime = starttime;
                    }
                    const createdTaskResponse = await axios.post("https://open.larksuite.com/open-apis/task/v2/tasks?user_id_type=open_id", {
                        "summary": data?.Process?.[0]?.text ? data?.Process?.[0]?.text : " ",
                        "completed_at": completedAt,
                        "description": data?.Remark?.[0]?.text ? data?.Remark?.[0]?.text : " ",
                        "start": {
                            "timestamp": starttime,
                            "is_all_day": false
                        },
                        "due": {
                            "timestamp": endtime,
                            "is_all_day": false
                        },
                        "members": [
                            {
                                "id": data.PIC[0].id,
                                "role": "assignee",
                                "type": "user"
                            }
                        ],
                        "tasklists": [
                            {
                                "tasklist_guid": tasklistId,
                                "section_guid": sectionId
                            }
                        ],
                        "reminders": [
                            {
                                "relative_fire_minute": 30
                            }
                        ]
                    }, {
                        headers: {
                            Authorization: `Bearer ${token}`
                        }
                    })

                    const { error: insertErr } = await supabase
                        .from("task-mapping")
                        .insert(
                            {
                                table_id: body.table_id,
                                base_id: body.app_id,
                                record_id: item.record_id,
                                task_id: createdTaskResponse.data.data.task.guid ?? "",
                            }
                        );

                    if (insertErr) {
                        console.error('Supabase insert error:', insertErr);
                        throw new Error(`Failed to insert tasklist mapping: ${insertErr.message}`);
                    }

                    try {
                        await axios.post(`https://open.larksuite.com/open-apis/task/v2/tasklists/${tasklistId}/add_members?user_id_type=open_id`, {
                            members: [
                                {
                                    "id": data.PIC[0].id,
                                    "role": "viewer",
                                    "type": "user"
                                }
                            ]
                        }, {
                            headers: {
                                Authorization: `Bearer ${token}`
                            }
                        })
                    } catch (e) {
                        console.log(e);
                    }
                }
            }
        }
        const nextResponse = NextResponse.json({}, { status: 200 });
        return nextResponse;
    } catch (e) {
        console.log(e);
        return handleError(e);
    }
}