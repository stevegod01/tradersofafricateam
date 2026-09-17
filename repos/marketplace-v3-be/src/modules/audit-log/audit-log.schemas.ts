const nullableString={type:'string',nullable:true};
const nullableObject={type:'object',additionalProperties:true,nullable:true};
export const auditRecordSchema={type:'object',properties:{
 id:{type:'string',format:'uuid'},eventCode:{type:'string'},actor:{type:'object',properties:{id:nullableString,type:{type:'string',enum:['user','admin','system']},email:nullableString}},
 module:{type:'string'},action:{type:'string'},entity:{type:'object',properties:{type:nullableString,id:nullableString}},
 description:{type:'string'},metadata:nullableObject,ipAddress:nullableString,createdAt:{type:'string',format:'date-time'},
 reason:nullableString,oldValue:nullableObject,newValue:nullableObject,userAgent:nullableString,requestId:nullableString,
}};
export const auditListResponse={200:{type:'object',properties:{success:{type:'boolean'},data:{type:'array',items:auditRecordSchema},pagination:{type:'object',properties:{page:{type:'integer'},limit:{type:'integer'},total:{type:'integer'},totalPages:{type:'integer'}}}}}};
export const auditDetailResponse={200:{type:'object',properties:{success:{type:'boolean'},data:auditRecordSchema}}};
