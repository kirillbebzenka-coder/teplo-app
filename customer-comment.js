/* One customer comment renderer for buyer, venue, dispatcher and assigned courier. */
export const CUSTOMER_COMMENT_MAX=500;
const oldSystemNotes=new Set(['[TEPLO TEST] Оператор подтверждает заказ; реальные заказы/оплата отключены.','Тестовый заказ TEPLO']);
export function customerCommentText(value){const text=typeof value==='string'?value.trim():'';return oldSystemNotes.has(text)?'':text;}
export function appendCustomerComment(root,value){
 const text=customerCommentText(value);if(!text)return null;
 if(!document.getElementById('customerCommentStyle')){const style=document.createElement('style');style.id='customerCommentStyle';style.textContent='.customer-comment{background:#291a30!important;border:1px solid #865079!important;border-radius:14px!important;padding:14px 16px!important;margin:15px 0!important;color:#f8e6f5}.customer-comment h3{font-size:14px!important;color:#f4b8df!important;margin:0 0 7px!important;font-weight:750}.customer-comment p{font-size:16px!important;line-height:1.5!important;margin:0!important;white-space:pre-wrap;overflow-wrap:anywhere;color:#f8e6f5!important}';document.head.append(style);}
 const box=document.createElement('section');box.className='customer-comment';box.dataset.customerComment='';box.setAttribute('aria-label','Комментарий покупателя');const title=document.createElement('h3');title.textContent='Комментарий к заказу';const body=document.createElement('p');body.textContent=text;box.append(title,body);root.append(box);return box;
}
export async function loadJobCustomerComments(db,jobs=[]){
 const ids=[...new Set(jobs.map(job=>job.id))],comments=new Map();
 for(let start=0;start<ids.length;start+=200){const {data,error}=await db.rpc('teplo_job_customer_comments',{p_job_ids:ids.slice(start,start+200)});if(error)throw error;for(const row of data||[])comments.set(row.job_id,row.customer_comment);}
 for(const job of jobs)job.customer_comment=comments.get(job.id)||'';
 return comments;
}
