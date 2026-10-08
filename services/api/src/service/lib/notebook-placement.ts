import { Injectable } from "@nestjs/common";
import { BadRequest } from "../../common/error/error-factory";
import { PermissionsService } from "../../common/permissions.service";

/** Guards putting an item into a notebook: same workspace + edit access on the notebook. */
@Injectable()
export class NotebookPlacement {
  constructor(private readonly permissions: PermissionsService) {}

  async assertCanPlaceIn(
    notebookId: string,
    workspaceId: string,
    actorUserId: string,
  ): Promise<void> {
    const access = await this.permissions.require(
      actorUserId,
      { kind: "notebook", id: notebookId },
      "edit",
    );
    if (access.workspaceId !== workspaceId) {
      throw BadRequest("Notebook belongs to a different workspace.");
    }
  }
}
