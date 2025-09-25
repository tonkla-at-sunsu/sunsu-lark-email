/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { getTenantAccessToken, handleError } from '@/lib/backend-helper';
import { getSupabaseServiceClient } from "@/lib/database";
import { addMemberToTask, addMemberToTaskList, createCustomFieldToTaskList, createSection, createTask, createTaskList, getTableInfo, getTaskInfo, removeMemberToTask, updateTask } from "@/lib/lark-helper";
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
    update_by: string;
}

export async function POST(request: NextRequest) {
    try {
        const body: WebhookRequest = await request.json();

        if (body.update_by == "IT Bot") {
            return NextResponse.json({}, { status: 200 });
        }

        const token = await getTenantAccessToken();
        const supabase = getSupabaseServiceClient();
        let customFieldId = ""
        let optionMapping: Record<string, string> = {
            "Not yet started": "",
            "Ongoing": "",
            "Completed": "",
            "Stelled": ""
        }

        const { data } = await supabase.from('task-mapping')
            .select()
            .eq('table_id', body.table_id)
            .eq('base_id', body.base_id)
            .eq('record_id', body.record_id);

        if (Array.isArray(data) && data.length == 0) {
            const { data } = await supabase.from('tasklist-mapping')
                .select()
                .eq('table_id', body.table_id)
                .eq('base_id', body.base_id)
            let taskListId = ""
            let sectionId = ""
            let taskListName = "empty"
            const sectionName = body.phase;
            const tableInfo = await getTableInfo(token, body.base_id);

            if (Array.isArray(tableInfo.items) && tableInfo.items.length > 0) {
                const foundItem = tableInfo.items.find((i: any) => i.table_id === body.table_id);
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
                }, "union_id")

                const customField = await createCustomFieldToTaskList(token, createdTaskList.guid);
                const sectionInfo = await createSection(token, {
                    "name": sectionName,
                    "resource_type": "tasklist",
                    "resource_id": createdTaskList.guid
                })

                sectionId = sectionInfo.guid;

                const { error: insertErr } = await supabase
                    .from("tasklist-mapping")
                    .insert(
                        {
                            table_id: body.table_id,
                            base_id: body.base_id,
                            tasklist_id: createdTaskList.guid,
                            tasklist_name: taskListName,
                            section_id: sectionId,
                            section_name: sectionName,
                            custom_field_id: customField.guid,
                            not_started_id: customField.not_started_id,
                            on_going_id: customField.not_started_id,
                            completed_id: customField.completed_id,
                            stalled_id: customField.stalled_id,
                        }
                    );

                if (insertErr) {
                    console.error('Supabase insert error:', insertErr);
                    throw new Error(`Failed to insert tasklist mapping: ${insertErr.message}`);
                }

                taskListId = createdTaskList.guid;
                customFieldId = customField.guid;
                optionMapping = {
                    "Not yet started": customField.not_started_id,
                    "Ongoing": customField.not_started_id,
                    "Completed": customField.completed_id,
                    "Stelled": customField.stalled_id
                };
            } else {
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

                    taskListId = data?.[0]?.tasklist_id ?? ""
                    customFieldId = data?.[0].custom_field_id;
                    optionMapping = {
                        "Not yet started": data?.[0].not_started_id,
                        "Ongoing": data?.[0].on_going_id,
                        "Completed": data?.[0].completed_id,
                        "Stelled": data?.[0].stalled_id,
                    }
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
                "completed_at": "0",
                "description": body.description !== "" ? body.description : " ",
                "start": {
                    "timestamp": body.start_time !== "" ? body.start_time : new Date().valueOf().toString(),
                    "is_all_day": false
                },
                "due": {
                    "timestamp": body.start_time !== "" ? body.start_time : new Date().valueOf().toString(),
                    "is_all_day": false
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
                "custom_fields": [{
                    "guid": customFieldId,
                    "single_select_value": statusId
                }],
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
        } else {
            const taskId = data?.[0].task_id;
            const taskDetail = await getTaskInfo(token, taskId);
            const tasklistId = taskDetail.tasklists[0].tasklist_guid;

            const { data: tasklistMapping } = await supabase.from('tasklist-mapping')
                .select()
                .eq('table_id', body.table_id)
                .eq('base_id', body.base_id)
                .eq('tasklist_id', tasklistId)

            optionMapping = {
                "Not yet started": tasklistMapping?.[0].not_started_id,
                "Ongoing": tasklistMapping?.[0].on_going_id,
                "Completed": tasklistMapping?.[0].completed_id,
                "Stelled": tasklistMapping?.[0].stalled_id,
            }
            customFieldId = tasklistMapping?.[0].custom_field_id;

            const status = body.status === "" ? "Not yet started" : body.status;
            const statusId = optionMapping[status];

            if (body.owner !== "") {
                if (Array.isArray(taskDetail.members)) {
                    const ownerFiltered = taskDetail.members.filter((m: Member) => m.role == "assignee")
                    if (Array.isArray(ownerFiltered) && ownerFiltered.length > 0) {
                        await removeMemberToTask(token, taskId, [{
                            "id": taskDetail.members.filter((m: Member) => m.role == "assignee")[0].id,
                            "role": "assignee",
                            "type": "user"
                        }])
                    }
                }

                await addMemberToTask(token, taskId, [{
                    "id": body.owner,
                    "role": "assignee",
                    "type": "user"
                }])
            }

            await updateTask(token, taskId, {
                "summary": body.title !== "" ? body.title : " ",
                "description": body.description !== "" ? body.description : " ",
                "start": {
                    "timestamp": body.start_time !== "" ? body.start_time : new Date().valueOf().toString(),
                    "is_all_day": false
                },
                "due": {
                    "timestamp": body.end_time !== "" ? body.end_time : new Date().valueOf().toString(),
                    "is_all_day": false
                },
                "custom_fields": [{
                    "guid": customFieldId,
                    "single_select_value": statusId
                }],
            }, ["summary", "description", "start", "due"])

            if (body.owner !== "") {
                const taskListId = taskDetail.tasklists[0].tasklist_guid;
                await addMemberToTaskList(token, taskListId, [{
                    "id": body.owner,
                    "role": "viewer",
                    "type": "user"
                }])
            }
        }

        const nextResponse = NextResponse.json({}, { status: 200 });
        return nextResponse;
    } catch (e) {
        return handleError(e);
    }
}