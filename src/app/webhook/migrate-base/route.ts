/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import { getTenantAccessToken, handleError } from '@/lib/backend-helper';
import { getSupabaseServiceClient } from "@/lib/database";
import { addMemberToTaskList, createCustomFieldToTaskList, createSection, createTaskList } from "@/lib/lark-helper";

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
            let customFieldId = ""
            let optionMapping: Record<string, string> = {
                "Not yet started": "",
                "Ongoing": "",
                "Completed": "",
                "Stalled": ""
            }

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

                // data["Created By"][0].id

                if (tasklistInfo?.length == 0) {
                    // no existing tasklist -> create
                    const createdTasklist = await createTaskList(token, {
                        "members": [{
                            "id": data.PIC[0].id,
                            "role": "viewer",
                            "type": "user"
                        }],
                        "name": taskListName
                    }, "open_id");
                    tasklistId = createdTasklist.guid;

                    const customField = await createCustomFieldToTaskList(token, tasklistId);
                    const sectionInfo = await createSection(token, {
                        "name": sectionName,
                        "resource_type": "tasklist",
                        "resource_id": createdTasklist.guid,
                    })

                    sectionId = sectionInfo.guid;

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
                                custom_field_id: customField.guid,
                                not_started_id: customField.not_started_id,
                                on_going_id: customField.on_going_id,
                                completed_id: customField.completed_id,
                                stalled_id: customField.stalled_id,
                            }
                        );

                    customFieldId = customField.guid;
                    optionMapping = {
                        "Not yet started": customField.not_started_id,
                        "Ongoing": customField.on_going_id,
                        "Completed": customField.completed_id,
                        "Stalled": customField.stalled_id
                    };

                    if (insertErr) {
                        console.error('Supabase insert error:', insertErr);
                        throw new Error(`Failed to insert tasklist mapping: ${insertErr.message}`);
                    }
                } else {
                    // existing tasklist -> get tasklist id
                    tasklistId = tasklistInfo?.[0].tasklist_id;

                    const filteredSection = tasklistInfo?.filter((i: any) => i.section_name === sectionName);

                    customFieldId = tasklistInfo?.[0].custom_field_id;
                    optionMapping = {
                        "Not yet started": tasklistInfo?.[0].not_started_id,
                        "Ongoing": tasklistInfo?.[0].on_going_id,
                        "Completed": tasklistInfo?.[0].completed_id,
                        "Stalled": tasklistInfo?.[0].stalled_id
                    };

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
                                    custom_field_id: tasklistInfo?.[0].custom_field_id,
                                    not_started_id: tasklistInfo?.[0].not_started_id,
                                    on_going_id: tasklistInfo?.[0].on_going_id,
                                    completed_id: tasklistInfo?.[0].completed_id,
                                    stalled_id: tasklistInfo?.[0].stalled_id,
                                }
                            );
                        if (insertErr) {
                            console.error('Supabase insert error:', insertErr);
                            throw new Error(`Failed to insert tasklist mapping: ${insertErr.message}`);
                        }
                    }
                }

                if (data?.["Created By"][0].id) {
                    await addMemberToTaskList(token, tasklistId, [
                        {
                            "id": data["Created By"][0].id,
                            "role": "editor",
                            "type": "user"
                        }
                    ])
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

                    const statusId = optionMapping[data.Status];

                    const completedAt = data.Status.toLowerCase() === "done" || data.Status.toLowerCase() === "completed" ? (new Date()).valueOf().toString() : "0"
                    const starttime = data["Start Date"] ? Number(data["Start Date"]).toString() : new Date().setHours(0, 0, 0, 0).valueOf().toString();
                    let endtime = data["Estimate Deadline"] ? Number(data["Estimate Deadline"]).toString() : new Date().setHours(0, 0, 0, 0).valueOf().toString();

                    if (Number(starttime) > Number(endtime)) {
                        endtime = starttime;
                    }
                    const createdTaskResponse = await axios.post("https://open.larksuite.com/open-apis/task/v2/tasks?user_id_type=open_id", {
                        "summary": data?.Process?.[0]?.text ? data?.Process?.[0]?.text : " ",
                        "completed_at": completedAt,
                        "description": data?.Remark?.[0]?.text ? data?.Remark?.[0]?.text : " ",
                        "custom_fields": [{
                            "guid": customFieldId,
                            "single_select_value": statusId
                        }],
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