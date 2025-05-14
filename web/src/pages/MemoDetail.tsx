import { Button } from "@usememos/mui";
import { MessageCircleIcon } from "lucide-react";
import { ClientError } from "nice-grpc-web";
import { useEffect, useState } from "react";
import { toast } from "react-hot-toast";
import { useLocation, useParams } from "react-router-dom";
import { MemoDetailSidebar, MemoDetailSidebarDrawer } from "@/components/MemoDetailSidebar";
import MemoEditor from "@/components/MemoEditor";
import MemoView from "@/components/MemoView";
import MobileHeader from "@/components/MobileHeader";
import useCurrentUser from "@/hooks/useCurrentUser";
import useNavigateTo from "@/hooks/useNavigateTo";
import useResponsiveWidth from "@/hooks/useResponsiveWidth";
import { memoNamePrefix, useMemoStore, useWorkspaceSettingStore } from "@/store/v1";
import { MemoRelation_Type } from "@/types/proto/api/v1/memo_relation_service";
import { Memo } from "@/types/proto/api/v1/memo_service";
import { User } from "@/types/proto/api/v1/user_service";
import { WorkspaceMemoRelatedSetting, WorkspaceSettingKey } from "@/types/proto/store/workspace_setting";
import { cn } from "@/utils";
import { useTranslate } from "@/utils/i18n";

const MemoDetail = () => {
  const t = useTranslate();
  const { md } = useResponsiveWidth();
  const params = useParams();
  const navigateTo = useNavigateTo();
  const { state: locationState } = useLocation();
  const workspaceSettingStore = useWorkspaceSettingStore();
  const currentUser = useCurrentUser();
  const memoStore = useMemoStore();
  const uid = params.uid;
  const memoName = `${memoNamePrefix}${uid}`;
  const memo = memoStore.getMemoByName(memoName);
  console.log("memo", memo);
  const workspaceMemoRelatedSetting = WorkspaceMemoRelatedSetting.fromPartial(
    workspaceSettingStore.getWorkspaceSettingByKey(WorkspaceSettingKey.MEMO_RELATED)?.memoRelatedSetting || {},
  );
  const [replyTo, setReplyTo] = useState<{ nickname: string; content: string } | undefined>(undefined);
  const [showCommentEditor, setShowCommentEditor] = useState(false);
  const commentRelations =
    memo?.relations.filter((relation) => relation.relatedMemo?.name === memo.name && relation.type === MemoRelation_Type.COMMENT) || [];
  const comments = commentRelations.map((relation) => memoStore.getMemoByName(relation.memo!.name)).filter((memo) => memo);
  const showCreateCommentButton = workspaceMemoRelatedSetting.enableComment && currentUser && !showCommentEditor;

  console.log("comments", comments);
  // Prepare memo.
  useEffect(() => {
    if (memoName) {
      memoStore.getOrFetchMemoByName(memoName).catch((error: ClientError) => {
        toast.error(error.details);
        navigateTo("/403");
      });
    } else {
      navigateTo("/404");
    }
  }, [memoName]);

  // Prepare memo comments.
  useEffect(() => {
    if (!memo) {
      return;
    }

    (async () => {
      await Promise.all(commentRelations.map((relation) => memoStore.getOrFetchMemoByName(relation.memo!.name)));
    })();
  }, [memo]);

  if (!memo) {
    return null;
  }

  const handleShowCommentEditor = () => {
    setReplyTo(undefined);
    setShowCommentEditor(true);
  };

  const handleCommentCreated = async (memoCommentName: string) => {
    await memoStore.getOrFetchMemoByName(memoCommentName);
    await memoStore.getOrFetchMemoByName(memo.name, { skipCache: true });
    setShowCommentEditor(false);
  };

  const comentHandler = (memo: Memo, creator: User) => {
    // setParentMemo(memo);
    setReplyTo({
      nickname: creator.nickname,
      content: memo.content,
    });
    setShowCommentEditor(true);
  };

  return (
    <section className="@container w-full max-w-5xl min-h-full flex flex-col justify-start items-center sm:pt-3 md:pt-6 pb-8">
      {!md && (
        <MobileHeader>
          <MemoDetailSidebarDrawer memo={memo} parentPage={locationState?.from} />
        </MobileHeader>
      )}
      <div className={cn("w-full flex flex-row justify-start items-start px-4 sm:px-6 gap-4")}>
        <div className={cn(md ? "w-[calc(100%-15rem)]" : "w-full")}>
          <MemoView
            key={`${memo.name}-${memo.displayTime}`}
            className="shadow hover:shadow-md transition-all"
            memo={memo}
            compact={false}
            parentPage={locationState?.from}
            showCreator
            showVisibility
            showPinned
          />
          <div className="pt-8 pb-16 w-full">
            <h2 id="comments" className="sr-only">
              {t("memo.comment.self")}
            </h2>
            <div className="relative mx-auto flex-grow w-full min-h-full flex flex-col justify-start items-start gap-y-1">
              {comments.length === 0 ? (
                showCreateCommentButton && (
                  <div className="w-full flex flex-row justify-center items-center py-6">
                    <Button variant="plain" color="primary" onClick={handleShowCommentEditor}>
                      <span className="text-gray-500">{t("memo.comment.write-a-comment")}</span>
                      <MessageCircleIcon className="ml-2 w-5 h-auto text-gray-500" />
                    </Button>
                  </div>
                )
              ) : (
                <>
                  <div className="w-full flex flex-row justify-between items-center h-8 pl-3 mb-2">
                    <div className="flex flex-row justify-start items-center">
                      <MessageCircleIcon className="w-5 h-auto text-gray-400 mr-1" />
                      <span className="text-gray-400 text-sm">{t("memo.comment.self")}</span>
                      <span className="text-gray-400 text-sm ml-1">({comments.length})</span>
                    </div>
                    {showCreateCommentButton && (
                      <Button variant="plain" color="primary" className="text-gray-500" onClick={handleShowCommentEditor}>
                        {t("memo.comment.write-a-comment")}
                      </Button>
                    )}
                  </div>
                  {comments.map((comment) => (
                    <MemoView
                      key={`${comment.name}-${comment.displayTime}`}
                      memo={comment}
                      parentPage={locationState?.from}
                      showCreator
                      compact
                      customComment={comentHandler}
                    />
                  ))}
                </>
              )}
            </div>
            {showCommentEditor && (
              <div className="w-full">
                <MemoEditor
                  cacheKey={`${memo.name}-${memo.updateTime}-comment`}
                  placeholder={t("editor.add-your-comment-here")}
                  parentMemoName={memo.name}
                  replyTo={replyTo}
                  autoFocus
                  onConfirm={handleCommentCreated}
                  onCancel={() => setShowCommentEditor(false)}
                />
              </div>
            )}
          </div>
        </div>
        {md && (
          <div className="sticky top-0 left-0 shrink-0 -mt-6 w-56 h-full">
            <MemoDetailSidebar className="py-6" memo={memo} parentPage={locationState?.from} />
          </div>
        )}
      </div>
    </section>
  );
};

export default MemoDetail;
