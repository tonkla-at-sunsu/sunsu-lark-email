/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { getTenantAccessToken, handleError } from '@/lib/backend-helper';
import { getSupabaseServiceClient } from "@/lib/database";
import { addMemberToTaskList, createCustomFieldToTaskList, createSection, createTask, createTaskList, getTableInfo } from "@/lib/lark-helper";
import { Member } from "@/types/lark";

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
        let taskListName = "empty"
        let customFieldId = ""
        let optionMapping: Record<string, string> = {
            "Not yet started": "",
            "Ongoing": "",
            "Completed": "",
            "Stalled": ""
        }

        const tableInfo = await getTableInfo(token, body.base_id);
        if (Array.isArray(tableInfo?.items) && tableInfo?.items.length > 0) {
            const foundItem = tableInfo?.items.find((i: any) => i.table_id === body.table_id);
            taskListName = foundItem?.name || "empty";
        }

        if (data?.length == 0) {
            const membersRequest: Member[] = [{
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

            const createdTaskList = await createTaskList(token, {
                "members": membersRequest,
                "name": taskListName
            }, "union_id");

            const { guid } = createdTaskList;
            const sectionName = body.phase;

            const customField = await createCustomFieldToTaskList(token, guid);
            const sectionInfo = await createSection(token, {
                "name": sectionName,
                "resource_type": "tasklist",
                "resource_id": createdTaskList.guid,
            })

            sectionId = sectionInfo.guid;

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
            taskListId = guid;

        } else {
            taskListId = data?.[0]?.tasklist_id ?? ""
            customFieldId = data?.[0].custom_field_id;
            optionMapping = {
                "Not yet started": data?.[0].not_started_id,
                "Ongoing": data?.[0].on_going_id,
                "Completed": data?.[0].completed_id,
                "Stalled": data?.[0].stalled_id,
            }

            const filteredSection = data?.filter((i: any) => i.section_name === body.phase);
            if (Array.isArray(filteredSection) && filteredSection.length > 0) {
                sectionId = filteredSection[0].section_id;
            } else {
                const sectionInfo = await createSection(token, {
                    "name": body.phase,
                    "resource_type": "tasklist",
                    "resource_id": taskListId
                })
                sectionId = sectionInfo.guid;

                const { error: insertErr } = await supabase
                    .from("tasklist-mapping")
                    .insert(
                        {
                            table_id: body.table_id,
                            base_id: body.base_id,
                            tasklist_id: taskListId,
                            tasklist_name: taskListName,
                            section_id: sectionId,
                            section_name: body.phase,
                            custom_field_id: data?.[0].custom_field_id,
                            not_started_id: data?.[0].not_started_id,
                            on_going_id: data?.[0].on_going_id,
                            completed_id: data?.[0].completed_id,
                            stalled_id: data?.[0].stalled_id,
                        }
                    );
                if (insertErr) {
                    console.error('Supabase insert error:', insertErr);
                    throw new Error(`Failed to insert tasklist mapping: ${insertErr.message}`);
                }
            }
        }

        const status = body.status === "" ? "Not yet started" : body.status;
        const statusId = optionMapping[status];

        const createdTask = await createTask(token, {
            "summary": body.title !== "" ? body.title : " ",
            "description": body.description !== "" ? body.description : " ",
            "start": {
                "timestamp": body.start_time !== "" ? body.start_time : new Date().setHours(0, 0, 0, 0).valueOf().toString(),
                "is_all_day": false
            },
            "due": {
                "timestamp": body.end_time !== "" ? body.end_time : new Date().setHours(23, 59, 0, 0).valueOf().toString(),
                "is_all_day": false
            },
            completed_at: "0",
            "custom_fields": [{
                "guid": customFieldId,
                "single_select_value": statusId
            }],
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
        })

        const { error: insertErr } = await supabase
            .from("task-mapping")
            .insert(
                {
                    table_id: body.table_id,
                    base_id: body.base_id,
                    record_id: body.record_id,
                    task_id: createdTask.guid ?? "",
                }
            );

        if (insertErr) {
            console.error('Supabase insert error:', insertErr);
            throw new Error(`Failed to insert tasklist mapping: ${insertErr.message}`);
        }

        if (body.owner !== "") {
            await addMemberToTaskList(token, taskListId, [
                {
                    "id": body.owner,
                    "role": "viewer",
                    "type": "user"
                }
            ])
        }

        const nextResponse = NextResponse.json({}, { status: 200 });
        return nextResponse;
    } catch (e) {
        return handleError(e);
    }
}