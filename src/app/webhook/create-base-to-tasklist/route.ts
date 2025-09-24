/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import { getTenantAccessToken, handleError } from '@/lib/backend-helper';
import { getSupabaseServiceClient } from "@/lib/database";


interface WebhookRequest {
    table_id: string;
    base_id: string;
    record_id: string;
    title: string;
    description: string;
    start_time: string;
    end_time: string;
    owner: string;
    status: string;
    phase: string;
    create_by: string;
}

export async function POST(request: NextRequest) {
    try {
        const body: WebhookRequest = await request.json();
        const token = await getTenantAccessToken();
        const supabase = getSupabaseServiceClient();

        const { data } = await supabase.from('tasklist-mapping')
            .select()
            .eq('table_id', body.table_id)
            .eq('base_id', body.base_id)
        let taskListId = ""
        let sectionId = ""

        const { data: tableInfo } = await axios.get(`https://open.larksuite.com/open-apis/bitable/v1/apps/${body.base_id}/tables`, {
            headers: {
                Authorization: `Bearer ${token}`
            }
        })
        let taskListName = "empty"
        if (Array.isArray(tableInfo.data?.items) && tableInfo.data?.items.length > 0) {
            const foundItem = tableInfo.data?.items.find((i: any) => i.table_id === body.table_id);
            taskListName = foundItem?.name || "empty";
        }

        if (data?.length == 0) {
            const membersRequest = [{
                "id": body.create_by,
                "role": "viewer",
                "type": "user"
            }]

            if (body.create_by !== body.owner) {
                membersRequest.push({
                    "id": body.owner,
                    "role": "viewer",
                    "type": "user"
                })
            }
            const response = await axios.post("https://open.larksuite.com/open-apis/task/v2/tasklists?user_id_type=union_id", {
                "members": membersRequest,
                "name": taskListName
            }, {
                headers: {
                    Authorization: `Bearer ${token}`
                }
            })

            const { guid } = response.data.data.tasklist;
            const sectionName = body.phase
            const { data: sectionInfo } = await axios.post("https://open.larksuite.com/open-apis/task/v2/sections", {
                "name": sectionName,
                "resource_type": "tasklist",
                "resource_id": guid
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
                        base_id: body.base_id,
                        tasklist_id: guid,
                        tasklist_name: taskListName,
                        section_id: sectionId,
                        section_name: sectionName,
                    }
                );

            if (insertErr) {
                console.error('Supabase insert error:', insertErr);
                throw new Error(`Failed to insert tasklist mapping: ${insertErr.message}`);
            }
            taskListId = guid;
        } else {
            taskListId = data?.[0]?.tasklist_id ?? ""
            const filteredSection = data?.filter((i: any) => i.section_name === body.phase);
            if(Array.isArray(filteredSection) && filteredSection.length > 0) {
                sectionId = filteredSection[0].section_id;
            }

            const { data: sectionInfo } = await axios.post("https://open.larksuite.com/open-apis/task/v2/sections", {
                "name": body.phase,
                "resource_type": "tasklist",
                "resource_id": taskListId
            }, {
                headers: {
                    Authorization: `Bearer ${token}`
                }
            })

            sectionId = sectionInfo.data.section.guid;
        }

        const completedAt = body.status.toLowerCase() === "done" || body.status.toLowerCase() === "completed" ? (new Date()).valueOf().toString() : "0"
        const createdTaskResponse = await axios.post("https://open.larksuite.com/open-apis/task/v2/tasks?user_id_type=union_id", {
            "summary": body.title !== "" ? body.title : " ",
            "completed_at": completedAt,
            "description": body.description !== "" ? body.description : " ",
            "due": {
                "timestamp": body.start_time !== "" ? body.start_time : new Date().valueOf(),
                "is_all_day": true
            },
            "members": [
                {
                    "id": body.owner,
                    "role": "assignee",
                    "type": "user"
                },
                {
                    "id": body.create_by,
                    "role": "follower",
                    "type": "user"
                }
            ],
            "tasklists": [
                {
                    "tasklist_guid": taskListId,
                    "section_guid": sectionId
                }
            ],
            "start": {
                "timestamp": body.start_time !== "" ? body.start_time : new Date().valueOf(),
                "is_all_day": true
            },
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
                    base_id: body.base_id,
                    record_id: body.record_id,
                    task_id: createdTaskResponse.data.data.task.guid ?? "",
                }
            );

        if (insertErr) {
            console.error('Supabase insert error:', insertErr);
            throw new Error(`Failed to insert tasklist mapping: ${insertErr.message}`);
        }

        if (body.owner !== "") {
            await axios.post(`https://open.larksuite.com/open-apis/task/v2/tasklists/${taskListId}/add_members?user_id_type=union_id`, {
                members: [
                    {
                        "id": body.owner,
                        "role": "viewer",
                        "type": "user"
                    }
                ]
            }, {
                headers: {
                    Authorization: `Bearer ${token}`
                }
            })
        }

        const nextResponse = NextResponse.json(createdTaskResponse.data, { status: createdTaskResponse.status });
        return nextResponse;
    } catch (e) {
        return handleError(e);
    }
}