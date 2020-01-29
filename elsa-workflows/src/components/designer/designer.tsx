import {Component, Event, Prop, Element, h, Host, Watch, State, Method, EventEmitter} from '@stencil/core';
import {jsPlumbInstance} from "jsplumb";
import {Activity, ActivityDefinition, Workflow} from "../../models";
import {
  createActivityElementId,
  createJsPlumb,
  displayWorkflow
} from "./jsplumb-utils";
import {createPanzoom} from "./panzoom-utils";
import {PanzoomObject} from "@panzoom/panzoom/dist/src/types";
import {Container} from "inversify";

const emptyWorkflow: Workflow = {
  id: null,
  activities: [],
  connections: []
};

export interface AddActivityArgs {
  mouseEvent: MouseEvent
}

export interface EditActivityArgs {
  activityId: string
}

@Component({
  tag: 'elsa-designer',
  styleUrl: 'designer.scss',
  scoped: true
})
export class DesignerComponent {

  private workflowCanvasElement: HTMLElement;
  private workflowContextMenu: HTMLElsaContextMenuElement;
  private activityContextMenu: HTMLElsaContextMenuElement;
  private jsPlumb: jsPlumbInstance;
  private panzoom: PanzoomObject;

  @Element() private element: HTMLElsaDesignerElement;

  @Prop() container: Container;
  @Prop() activityDefinitions: Array<ActivityDefinition> = [];
  @Prop() workflow: Workflow | string;

  @Event({eventName: 'add-activity'}) addActivityEvent: EventEmitter<AddActivityArgs>;
  @Event({eventName: 'edit-activity'}) editActivityEvent: EventEmitter<EditActivityArgs>;

  @State() private workflowModel: Workflow = emptyWorkflow;

  @Watch('workflow')
  workflowHandler(newValue: Workflow | string) {
    this.workflowModel = this.parseWorkflow(newValue);
  }

  @Method()
  async registerService(action: (container: Container) => void): Promise<void> {
    action(this.container);
  }

  @Method()
  async getWorkflow(): Promise<Workflow> {
    return {...this.workflowModel};
  }

  @Method()
  async getActivity(id: string): Promise<Activity> {
    const activity = this.workflowModel.activities.find(x => x.id === id);
    return {...activity};
  }

  @Method()
  async addActivity(activity: Activity) {
    const activities = [...this.workflowModel.activities, activity];
    this.workflowModel = {...this.workflowModel, activities};
  }

  @Method()
  async getTransform(): Promise<{ x: number, y: number, scale: number }> {
    const rect = this.workflowCanvasElement.getBoundingClientRect();
    const scale = this.panzoom.getScale();
    return {x: rect.x, y: rect.y, scale};
  }

  componentWillLoad() {
    this.workflowModel = this.parseWorkflow(this.workflow);
  }

  componentDidLoad() {
    this.panzoom = createPanzoom(this.workflowCanvasElement, zoom => this.jsPlumb.setZoom(zoom));
  }

  componentDidRender() {
    this.setupJsPlumb();
  }

  private parseWorkflow = (value: Workflow | string): Workflow => !!value ? value instanceof String ? JSON.parse(value as string) : value as Workflow : null;
  private workflowOrDefault = () => this.workflowModel || emptyWorkflow;

  private setupJsPlumb = () => {
    let jsPlumb = this.jsPlumb;

    if (!jsPlumb)
      jsPlumb = this.jsPlumb = createJsPlumb(this.workflowCanvasElement);

    jsPlumb.reset();
    jsPlumb.bind('connection', this.connectionCreated);
    jsPlumb.bind('connectionDetached', this.connectionDetached);

    const workflow = this.workflowOrDefault();
    displayWorkflow(jsPlumb, this.workflowCanvasElement, workflow, this.activityDefinitions);
  };

  private connectionCreated = (info) => {
    const workflow = this.workflowOrDefault();
    const connection = info.connection;
    const sourceEndpoint = info.sourceEndpoint;
    const outcome = sourceEndpoint.getParameter('outcome');
    const labelOverLayId = sourceEndpoint.connectorOverlays[0][1].id;
    const labelOverlay = connection.getOverlay(labelOverLayId);

    labelOverlay.setLabel(outcome);

    // Check if we already have this connection.
    const sourceActivityId = info.source.getAttribute('data-activity-id');
    const targetActivityId = info.target.getAttribute('data-activity-id');
    const wfConnection = workflow.connections.find(x => x.sourceActivityId === sourceActivityId && x.targetActivityId === targetActivityId);

    if (!wfConnection) {
      // Add created connection to list.
      workflow.connections.push({
        sourceActivityId: sourceActivityId,
        targetActivityId: targetActivityId,
        outcome: outcome
      });
    }
  };

  private connectionDetached = (info) => {
    const workflow = this.workflowOrDefault();
    const sourceEndpoint = info.sourceEndpoint;
    const outcome = sourceEndpoint.getParameter('outcome');
    const sourceActivityId = info.source.getAttribute('data-activity-id');
    const targetActivityId = info.target.getAttribute('data-activity-id');

    workflow.connections = workflow.connections.filter(x => !(x.sourceActivityId === sourceActivityId && x.targetActivityId === targetActivityId && x.outcome === outcome));
  };

  private editSelectedActivity = () => {
  };

  private deleteSelectedActivity = () => {
  };

  private onWorkflowContextMenu = async (e: MouseEvent) => await this.workflowContextMenu.show(e);
  private onActivityContextMenu = async (e: MouseEvent, activity: Activity) => await this.activityContextMenu.show(e, activity);
  private onEditActivityClick = async e => this.editActivityEvent.emit({activityId: (await this.activityContextMenu.getContext() as Activity).id});

  private onAddActivityClick = (e: MouseEvent) => {
    return this.addActivityEvent.emit({mouseEvent: e});
  };


  private renderActivity = (activity: Activity) => {

    const activityDefinition = this.activityDefinitions.find(x => x.type === activity.type);
    const displayName = activity.displayName || activityDefinition.displayName;

    const styles = {
      left: `${activity.left}px`,
      top: `${activity.top}px`
    };

    return (
      <div key={activity.id} id={createActivityElementId(activity.id)}
           data-activity-id={activity.id}
           class="activity noselect panzoom-exclude"
           style={styles}
           onContextMenu={e => this.onActivityContextMenu(e, activity)}>
        <h5><i class="fas fa-cog"/>{displayName}</h5>
      </div>
    );
  };

  render() {
    const workflow = this.workflowOrDefault();

    return (
      <Host>
        <div class="workflow-canvas-container">
          <div class="workflow-canvas" ref={el => this.workflowCanvasElement = el} onContextMenu={this.onWorkflowContextMenu}>
            {workflow.activities.map(this.renderActivity)}
          </div>
        </div>
        <elsa-context-menu ref={el => this.workflowContextMenu = el}>
          <elsa-context-menu-item onClick={this.onAddActivityClick}>Add Activity</elsa-context-menu-item>
        </elsa-context-menu>
        <elsa-context-menu ref={el => this.activityContextMenu = el}>
          <elsa-context-menu-item onClick={this.onEditActivityClick}>Edit Activity</elsa-context-menu-item>
        </elsa-context-menu>
      </Host>
    );
  }
}
